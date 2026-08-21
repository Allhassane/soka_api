/// <reference types="jest" />
import {
  BadRequestException,
  ForbiddenException,
  HttpStatus,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { AuthService } from './auth.service';

/**
 * Couvre `requestPasswordReset` (« Recevoir mon mot de passe »).
 *
 * Ce qui est verrouillé ici : les réponses ne sont plus génériques. Chaque situation qui
 * empêche le membre de recevoir son SMS doit remonter une erreur DISTINCTE, parce que la
 * page en fait une alerte lisible. Un retour à « toujours 200 » afficherait à nouveau un
 * faux « SMS envoyé » et laisserait le membre attendre indéfiniment.
 *
 * Verrouillé aussi : le mot de passe n'est JAMAIS écrit en base si le SMS n'est pas parti
 * (sinon le compte est perdu pour son propriétaire), et le cooldown n'est posé que sur un
 * envoi réel.
 *
 * Depuis le 2026-08-02 : le mot de passe fait **4 chiffres** et la fenêtre anti-relance est
 * de **24 h, lue dans `users.sending_at`** (plus en mémoire) - un redémarrage de l'API ne
 * doit plus rouvrir la porte, et le refus doit rappeler la date de l'envoi précédent.
 */

const ACTIVE_USER = {
  id: 1,
  uuid: 'u-1',
  phone_number: '0749326623',
  is_active: true,
  // Aucun mot de passe encore envoyé : le cas nominal.
  sending_at: null as Date | null,
};

const HEURES = (n: number) => new Date(Date.now() - n * 60 * 60 * 1000);

function makeService(
  opts: { user?: any; smsOk?: boolean } = {},
): {
  service: AuthService;
  send: jest.Mock;
  update: jest.Mock;
  journal: jest.Mock;
} {
  const user = 'user' in opts ? opts.user : ACTIVE_USER;
  const smsOk = opts.smsOk ?? true;

  const send = jest.fn(async () =>
    smsOk
      ? { success: true, provider: 'letexto' }
      : { success: false, provider: null, error: 'fournisseur injoignable' },
  );
  const update = jest.fn(async () => undefined);
  const journal = jest.fn(async () => undefined);

  const userRepository = {
    findOne: jest.fn(async () => user ?? null),
    update,
  } as any;

  const service = new AuthService(
    {} as any, // userService
    {} as any, // jwtService
    {} as any, // roleService
    {} as any, // memberRepository
    {} as any, // structureRepository
    {} as any, // levelRepository
    userRepository,
    { send } as any, // smsDispatcher
    {} as any, // accessScopeService
    {} as any, // userRoleService
    // Journal de connexion : un espion suffit, `requestPasswordReset` ne l'utilise pas -
    // mais le constructeur l'exige, et un `{}` ferait échouer tout appel réel en silence.
    { record: journal } as any, // loginJournal
  );

  return { service, send, update, journal };
}

describe('AuthService.requestPasswordReset', () => {
  it('refuse un numéro vide', async () => {
    const { service, send } = makeService();
    await expect(service.requestPasswordReset('   ')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(send).not.toHaveBeenCalled();
  });

  it('renvoie 404 quand le numéro ne correspond à aucun compte', async () => {
    const { service, send, update } = makeService({ user: null });

    await expect(
      service.requestPasswordReset('0700000000'),
    ).rejects.toBeInstanceOf(NotFoundException);

    // Aucun SMS ne doit partir sur un numéro inconnu (crédits + risque d'envoyer un
    // mot de passe à un tiers).
    expect(send).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it('renvoie 403 quand le compte est désactivé', async () => {
    const { service, send } = makeService({
      user: { ...ACTIVE_USER, is_active: false },
    });

    await expect(
      service.requestPasswordReset(ACTIVE_USER.phone_number),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(send).not.toHaveBeenCalled();
  });

  it('envoie le SMS, enregistre le mot de passe et renvoie le délai de relance', async () => {
    const { service, send, update } = makeService();

    const result: any = await service.requestPasswordReset(
      ACTIVE_USER.phone_number,
    );

    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0].to).toBe(ACTIVE_USER.phone_number);
    // Le délai renvoyé pilote le compte à rebours de la page : il doit venir de l'API.
    expect(result.retry_after).toBe(AuthService.RESET_COOLDOWN_SECONDS);

    // must_change_password est levé : sans ça, login() relancerait handleFirstLogin et le
    // mot de passe reçu par SMS serait refusé.
    expect(update).toHaveBeenCalledTimes(1);
    expect(update.mock.calls[0][1].must_change_password).toBe(false);
    expect(typeof update.mock.calls[0][1].password).toBe('string');
  });

  // Timeout élargi : chaque itération hache réellement en bcrypt coût 10 (~65 ms), c'est
  // le hachage qui coûte, pas le tirage.
  it('envoie un mot de passe de 4 chiffres, zéros de tête compris', async () => {
    // 40 tirages : la longueur ne doit jamais varier. Sans `padStart`, un tirage < 1000
    // partirait à 3 chiffres (« 482 ») - le membre saisirait alors un mot de passe plus
    // court que celui annoncé et se croirait refusé à tort.
    const vus = new Set<string>();
    for (let i = 0; i < 40; i++) {
      const { service, send } = makeService();
      await service.requestPasswordReset(ACTIVE_USER.phone_number);
      const message: string = send.mock.calls[0][0].message;
      const found = /mot de passe est (\S+)\./.exec(message);
      expect(found).not.toBeNull();
      expect(found![1]).toMatch(/^\d{4}$/);
      vus.add(found![1]);
    }
    // Garde-fou contre un mot de passe constant (une régression qui passerait toutes les
    // autres assertions et donnerait le MÊME code à tous les membres).
    expect(vus.size).toBeGreaterThan(20);
  }, 30_000);

  // Règle du 2026-08-19 : le message DOIT s'ouvrir sur le sender ID validé chez les deux
  // fournisseurs, pour que le nom lu dans le texte soit celui affiché comme expéditeur.
  // Le message est aussi le MÊME que celui de la 1re connexion : les deux portes d'entrée
  // divergeaient d'un mot, sans raison.
  it("ouvre le SMS sur le sender ID « SOKA CI »", async () => {
    const { service, send } = makeService();

    await service.requestPasswordReset(ACTIVE_USER.phone_number);

    const message: string = send.mock.calls[0][0].message;
    expect(message).toMatch(
      /^SOKA CI : votre nouveau mot de passe est \d{4}\. Connectez-vous avec ce mot de passe\.$/,
    );
  });

  it("marque la demande en base (is_sent + sending_at) dans le même update", async () => {
    const { service, update } = makeService();

    await service.requestPasswordReset(ACTIVE_USER.phone_number);

    const written = update.mock.calls[0][1];
    expect(written.is_sent).toBe(true);
    expect(written.sending_at).toBeInstanceOf(Date);
    // Même écriture que le mot de passe : les deux ne peuvent pas diverger.
    expect(typeof written.password).toBe('string');
  });

  it('normalise le numéro saisi avec des espaces', async () => {
    const { service, send } = makeService();

    await service.requestPasswordReset(' 07 49 32 66 23 ');

    expect(send.mock.calls[0][0].to).toBe(ACTIVE_USER.phone_number);
  });

  it('refuse une relance en 429 quand un envoi date de moins de 24 h', async () => {
    const { service, send, update } = makeService({
      user: { ...ACTIVE_USER, sending_at: HEURES(3) },
    });

    await expect(
      service.requestPasswordReset(ACTIVE_USER.phone_number),
    ).rejects.toMatchObject({ status: HttpStatus.TOO_MANY_REQUESTS });

    // Aucun SMS, aucune écriture : le mot de passe déjà envoyé reste valable. Le
    // régénérer invaliderait celui que le membre est peut-être en train de saisir.
    expect(send).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it('rappelle le jour et l’heure de l’envoi précédent dans le message de refus', async () => {
    // C'est la demande produit : le membre doit pouvoir retrouver le SMS, pas seulement
    // apprendre qu'il doit patienter.
    const envoyeLe = new Date('2026-08-02T14:32:00Z');
    const { service } = makeService({
      user: { ...ACTIVE_USER, sending_at: envoyeLe },
    });
    jest.spyOn(Date, 'now').mockReturnValue(
      envoyeLe.getTime() + 3 * 60 * 60 * 1000,
    );

    try {
      await service.requestPasswordReset(ACTIVE_USER.phone_number);
      throw new Error('aurait dû être refusé');
    } catch (error: any) {
      const message: string = error?.response ?? error?.message ?? '';
      expect(message).toContain('2 août 2026');
      expect(message).toContain('14:32'); // serveur en UTC = heure d'Abidjan
      expect(message).toContain('21 h'); // délai restant, en heures et non en minutes
    } finally {
      jest.restoreAllMocks();
    }
  });

  it('laisse passer une demande quand le dernier envoi a plus de 24 h', async () => {
    const { service, send } = makeService({
      user: { ...ACTIVE_USER, sending_at: HEURES(25) },
    });

    await service.requestPasswordReset(ACTIVE_USER.phone_number);

    expect(send).toHaveBeenCalledTimes(1);
  });

  it('ne bloque pas sur une date d’envoi future (horloge décalée)', async () => {
    // Une date future donnerait un délai restant supérieur à 24 h : le membre serait
    // enfermé sans issue par une donnée incohérente.
    const { service, send } = makeService({
      user: { ...ACTIVE_USER, sending_at: HEURES(-5) },
    });

    await service.requestPasswordReset(ACTIVE_USER.phone_number);

    expect(send).toHaveBeenCalledTimes(1);
  });

  it("laisse le mot de passe INCHANGÉ et remonte 503 si l'envoi échoue", async () => {
    const { service, send, update } = makeService({ smsOk: false });

    await expect(
      service.requestPasswordReset(ACTIVE_USER.phone_number),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);

    expect(send).toHaveBeenCalledTimes(1);
    // Écrire le mot de passe ici enfermerait le membre dehors : il ne l'a jamais reçu.
    expect(update).not.toHaveBeenCalled();
  });

  it("ne pose PAS de cooldown quand l'envoi a échoué", async () => {
    const { service, update } = makeService({ smsOk: false });

    await expect(
      service.requestPasswordReset(ACTIVE_USER.phone_number),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);

    // `sending_at` n'est pas écrit : c'est ce qui laisse la 2e tentative repartir
    // immédiatement (elle échoue pour la même raison, pas en 429). Enfermer un membre
    // 24 h après un envoi qui n'est jamais parti serait une punition pour une panne
    // côté fournisseur - et, avec cette fenêtre-là, une journée entière sans accès.
    expect(update).not.toHaveBeenCalled();
    await expect(
      service.requestPasswordReset(ACTIVE_USER.phone_number),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
