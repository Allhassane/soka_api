import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { HubSyncJournal } from './hub-sync-journal';

/**
 * Le journal de bord existe pour répondre à « le cron tourne-t-il ? ». Ces tests verrouillent
 * les deux propriétés qui rendent la réponse fiable : **les quatre issues sont écrites** (un
 * journal qui ne consigne que les succès ne prouve rien) et **une panne d'écriture ne casse
 * pas le cron** (perdre une ligne est sans gravité, perdre un passage coûte de l'argent).
 */
describe('HubSyncJournal', () => {
  let dossier: string;
  let fichier: string;

  beforeEach(() => {
    dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'hub-sync-journal-'));
    fichier = path.join(dossier, 'sous-dossier', 'hub-sync-cron.log');
  });

  afterEach(() => fs.rmSync(dossier, { recursive: true, force: true }));

  const lire = () => fs.readFileSync(fichier, 'utf8');

  const compteurs = {
    processed: 37, paid: 2, recredited: 0, failed: 5,
    abandoned: 3, pending: 27, errors: 0,
  };

  it('crée le dossier manquant et pose un en-tête explicatif sur un fichier neuf', () => {
    new HubSyncJournal(fichier).passageOk(compteurs, 12_400, false);

    const contenu = lire();
    // L'en-tête n'est pas décoratif : il dit comment lire l'ABSENCE de lignes, qui est le
    // symptôme principal qu'on cherche dans ce fichier.
    expect(contenu).toContain("Comment lire l ABSENCE de lignes");
    expect(contenu).toContain('traités=37 payés=2 rattrapés=0 échoués=5 abandons=3 attente=27 erreurs=0');
    expect(contenu).toContain('12.4s');
  });

  it('🚨 écrit les QUATRE issues, pas seulement les passages réussis', () => {
    const journal = new HubSyncJournal(fichier);

    journal.demarrage(true, '0 */10 * * * *');
    journal.passageOk(compteurs, 800, false);
    journal.passageIgnore();
    journal.passageDesarme();
    journal.passageEnErreur('connect ECONNREFUSED', 8_100);

    const contenu = lire();
    // Sans ces lignes, un cron désarmé ou qui plante laisserait un fichier identique à celui
    // d'un cron mort : impossible de trancher.
    expect(contenu).toContain('DÉMARRAGE');
    expect(contenu).toContain('OK ');
    expect(contenu).toContain('IGNORÉ');
    expect(contenu).toContain('DÉSARMÉ');
    expect(contenu).toContain('ERREUR');
    expect(contenu).toContain('connect ECONNREFUSED');
  });

  it('🚨 n écrit QU UNE ligne DÉMARRAGE par processus, même si le hook se rejoue', () => {
    const journal = new HubSyncJournal(fichier);

    // `onModuleInit` se déclenche 5 fois sur le même singleton (PaymentModule est importé par
    // 5 modules). Sans verrou, chaque redémarrage poserait 5 lignes et « deux DÉMARRAGE
    // rapprochés = redémarrages en boucle » deviendrait un faux signal.
    for (let i = 0; i < 5; i += 1) journal.demarrage(true, '0 */10 * * * *');

    const lignes = lire()
      .split(String.fromCharCode(10))
      .filter((l) => !l.startsWith('#') && l.includes('DÉMARRAGE'));
    expect(lignes).toHaveLength(1);
  });

  it('annonce en toutes lettres un cron DÉSARMÉ au démarrage', () => {
    new HubSyncJournal(fichier).demarrage(false, '0 */10 * * * *');

    // En production c'est la ligne la plus grave du fichier : plus rien n'est crédité.
    expect(lire()).toContain('cron DÉSARMÉ');
  });

  it('🚨 signale un rattrapage en toutes lettres, pas seulement par son compteur', () => {
    new HubSyncJournal(fichier)
      .passageOk({ ...compteurs, recredited: 2 }, 900, false);

    expect(lire()).toContain('2 paiement(s) refermé(s) à tort puis encaissé(s)');
  });

  it('marque la saturation de la file', () => {
    new HubSyncJournal(fichier).passageOk({ ...compteurs, processed: 500 }, 900, true);

    expect(lire()).toContain('SATURÉ');
  });

  it('bascule le fichier en `.1` au-delà de la taille maximale', () => {
    fs.mkdirSync(path.dirname(fichier), { recursive: true });
    fs.writeFileSync(fichier, 'x'.repeat(2 * 1024 * 1024 + 1), 'utf8');

    new HubSyncJournal(fichier).passageOk(compteurs, 900, false);

    expect(fs.existsSync(`${fichier}.1`)).toBe(true);
    // Le fichier courant repart d'un en-tête, pas d'une ligne orpheline.
    expect(lire()).toContain('Journal du cron de synchronisation HUB2');
    expect(lire()).toContain('traités=37');
  });

  it('🚨 une écriture impossible ne lève PAS : le journal ne casse jamais le cron', () => {
    // Le dossier existe déjà en tant que FICHIER : toute création dedans échouera.
    const bloquant = path.join(dossier, 'bloquant');
    fs.writeFileSync(bloquant, 'je suis un fichier, pas un dossier');

    const journal = new HubSyncJournal(path.join(bloquant, 'impossible.log'));

    expect(() => journal.passageOk(compteurs, 900, false)).not.toThrow();
  });

  it('reste muet quand le journal est désactivé (chemin vide)', () => {
    const journal = new HubSyncJournal(null);

    expect(journal.chemin).toBeNull();
    expect(() => journal.passageOk(compteurs, 900, false)).not.toThrow();
    expect(fs.existsSync(fichier)).toBe(false);
  });
});
