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
 */

const ACTIVE_USER = {
  id: 1,
  uuid: 'u-1',
  phone_number: '0749326623',
  is_active: true,
};

function makeService(
  opts: { user?: any; smsOk?: boolean } = {},
): {
  service: AuthService;
  send: jest.Mock;
  update: jest.Mock;
} {
  const user = 'user' in opts ? opts.user : ACTIVE_USER;
  const smsOk = opts.smsOk ?? true;

  const send = jest.fn(async () =>
    smsOk
      ? { success: true, provider: 'letexto' }
      : { success: false, provider: null, error: 'fournisseur injoignable' },
  );
  const update = jest.fn(async () => undefined);

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
  );

  return { service, send, update };
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

  it('normalise le numéro saisi avec des espaces', async () => {
    const { service, send } = makeService();

    await service.requestPasswordReset(' 07 49 32 66 23 ');

    expect(send.mock.calls[0][0].to).toBe(ACTIVE_USER.phone_number);
  });

  it('refuse une relance trop rapprochée en 429, sans réenvoyer de SMS', async () => {
    const { service, send } = makeService();

    await service.requestPasswordReset(ACTIVE_USER.phone_number);
    const second = service.requestPasswordReset(ACTIVE_USER.phone_number);

    await expect(second).rejects.toMatchObject({
      status: HttpStatus.TOO_MANY_REQUESTS,
    });
    // Un seul SMS pour deux demandes : c'est tout l'objet du cooldown (chaque envoi
    // coûte 2 SMS facturés en mode diffusion).
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
    const { service } = makeService({ smsOk: false });

    await expect(
      service.requestPasswordReset(ACTIVE_USER.phone_number),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);

    // La 2e tentative doit repartir immédiatement (elle échoue pour la même raison, pas
    // en 429) : bloquer 5 min après un envoi qui n'est jamais parti serait une punition
    // pour une panne côté fournisseur.
    await expect(
      service.requestPasswordReset(ACTIVE_USER.phone_number),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
