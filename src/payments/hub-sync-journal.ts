import * as fs from 'fs';
import * as path from 'path';

/**
 * **Journal de bord du cron de synchronisation HUB2** - un fichier, une ligne par passage.
 *
 * Il répond à UNE question : *« le cron tourne-t-il, et que fait-il ? »*. Les journaux pm2
 * (`/var/log/pm2/soka-api-out.log`) portent déjà l'information, mais noyée dans tout le trafic
 * de l'API : il faut la chercher, donc en pratique personne ne la regarde. Ici, `tail` suffit.
 *
 * 🚨 **Les QUATRE issues d'un passage sont écrites, pas seulement les bonnes.** Un journal qui
 * ne consigne que les succès ne prouve rien : un cron désarmé, qui plante ou qui se chevauche
 * n'y laisserait aucune trace et le fichier ressemblerait à un fichier de cron mort. C'est
 * précisément l'ambiguïté qu'on veut supprimer.
 *
 * ⚠️ **Ce journal ne doit JAMAIS faire échouer le cron.** Toute erreur d'écriture (disque plein,
 * droits, chemin invalide) est avalée : perdre une ligne de journal est sans gravité, perdre un
 * passage de synchronisation coûte de l'argent réel.
 *
 * ⚠️ Écriture **synchrone** et assumée : un passage toutes les 10 minutes, donc ~144 lignes par
 * jour. Le coût est nul, et la ligne est sur le disque avant que le processus puisse mourir -
 * ce qui compte justement quand on enquête sur un crash.
 */

/** Au-delà, le fichier est basculé en `.1`. ~2 Mo ≈ 20 000 lignes ≈ 140 jours de passages. */
const TAILLE_MAX_OCTETS = 2 * 1024 * 1024;

/** Issues possibles d'un passage. Largeur fixe à l'affichage pour que les colonnes s'alignent. */
export type IssuePassage =
  | 'DEMARRAGE'
  | 'OK'
  | 'IGNORE'
  | 'DESARME'
  | 'ERREUR';

const LIBELLES: Record<IssuePassage, string> = {
  DEMARRAGE: 'DÉMARRAGE',
  OK: 'OK',
  IGNORE: 'IGNORÉ',
  DESARME: 'DÉSARMÉ',
  ERREUR: 'ERREUR',
};

const EN_TETE = [
  '# Journal du cron de synchronisation HUB2 - une ligne par passage (toutes les 10 min).',
  '#',
  '# Colonnes : horodatage UTC | issue | durée | détail',
  '#',
  '#   DÉMARRAGE  le processus de l API vient de démarrer (pm2 restart, crash suivi d un',
  '#              redémarrage…). Le cron vit DANS ce processus : deux DÉMARRAGE rapprochés',
  '#              signalent des redémarrages en boucle.',
  '#   OK         passage terminé. Le détail donne les compteurs.',
  '#   IGNORÉ     le passage précédent durait encore : celui-ci a été sauté.',
  '#              Isolé, c est normal (file longue). Répété, la synchronisation prend plus',
  '#              de 10 minutes et prend du retard.',
  '#   DÉSARMÉ    HUB_SYNC_CRON_ENABLED=false. 🚨 En production, cela ne doit JAMAIS arriver :',
  '#              plus rien n est crédité tant que la variable est posée.',
  '#   ERREUR     le passage a levé une exception. Le détail porte le message.',
  '#',
  '# 🚨 Comment lire l ABSENCE de lignes : le cron n écrit que s il s exécute. Si la dernière',
  '#    ligne date de plus de ~10 minutes, c est que le processus de l API est arrêté ou bloqué.',
  '#    Un fichier qui ne bouge plus est un symptôme, pas un silence rassurant.',
  '#',
  '# Compteurs de la ligne OK :',
  '#   traités   lignes interrogées au guichet (les deux files cumulées)',
  '#   payés     paiements en attente qui viennent d aboutir',
  '#   rattrapés 🚨 paiements REFERMÉS À TORT que le guichet avait encaissés. Doit rester à 0.',
  '#   échoués   tentatives dont le guichet confirme l échec',
  '#   abandons  liens jamais engagés et refermés (c est ce qui fait décroître la file)',
  '#   attente   toujours en cours chez l opérateur',
  '#   erreurs   interrogations qui ont échoué (guichet injoignable, etc.)',
  '#   SATURÉ    la file a touché son plafond : des paiements plus anciens n ont pas été vus.',
  '',
].join('\n');

/** Compteurs d un passage abouti, tels que `syncAllPendingHubPayments` les rend. */
export interface CompteursPassage {
  processed: number;
  paid: number;
  recredited: number;
  failed: number;
  abandoned: number;
  pending: number;
  errors: number;
}

export class HubSyncJournal {
  private readonly fichier: string | null;

  /**
   * 🚨 **`onModuleInit` se déclenche PLUSIEURS FOIS sur le même singleton** - mesuré : **5 fois**
   * pour un seul démarrage, parce que `PaymentModule` est importé par 5 modules et que Nest
   * rejoue le hook pour chacun. Il n'y a bien qu'**une** instance et **un** job planifié
   * (vérifié via `SchedulerRegistry`), donc aucune synchronisation concurrente - mais sans ce
   * verrou le fichier porterait 5 lignes DÉMARRAGE par redémarrage, et le signal « deux
   * DÉMARRAGE rapprochés = redémarrages en boucle » deviendrait faux.
   */
  private demarrageEcrit = false;

  constructor(fichier?: string | null) {
    this.fichier = fichier === undefined ? HubSyncJournal.cheminParDefaut() : fichier;
  }

  /**
   * `HUB_SYNC_LOG_FILE` sinon `<cwd>/logs/hub-sync-cron.log`.
   *
   * En production, pm2 fixe `cwd` à `/var/www/projects/soka/api` (`ecosystem.config.js`) : le
   * fichier est donc toujours au même endroit, quel que soit l endroit d où pm2 est lancé.
   * Poser `HUB_SYNC_LOG_FILE=` (vide) désactive le journal.
   *
   * ⚠️ **Muet sous Jest** : sans cette garde, chaque exécution de la suite de tests créerait un
   * `logs/` dans le dépôt et y empilerait des passages fictifs.
   */
  private static cheminParDefaut(): string | null {
    if (process.env.JEST_WORKER_ID) return null;
    const configure = process.env.HUB_SYNC_LOG_FILE;
    if (configure !== undefined) return configure.trim() === '' ? null : configure.trim();
    return path.join(process.cwd(), 'logs', 'hub-sync-cron.log');
  }

  /** Le chemin réellement utilisé, pour pouvoir l annoncer au démarrage. `null` = désactivé. */
  get chemin(): string | null {
    return this.fichier;
  }

  demarrage(arme: boolean, intervalle: string) {
    if (this.demarrageEcrit) return;
    this.demarrageEcrit = true;

    this.ecrire(
      'DEMARRAGE',
      null,
      arme
        ? `API démarrée, cron ARMÉ (${intervalle})`
        : `API démarrée, cron DÉSARMÉ (HUB_SYNC_CRON_ENABLED=false) - aucun paiement ne sera crédité`,
    );
  }

  passageOk(compteurs: CompteursPassage, dureeMs: number, sature: boolean) {
    const detail =
      `traités=${compteurs.processed} payés=${compteurs.paid} `
      + `rattrapés=${compteurs.recredited} échoués=${compteurs.failed} `
      + `abandons=${compteurs.abandoned} attente=${compteurs.pending} `
      + `erreurs=${compteurs.errors}`
      + (sature ? '  🚨 SATURÉ' : '')
      // Écrit en toutes lettres plutôt que laissé au seul compteur : c est la ligne qu on
      // cherchera dans six mois, et `rattrapés=2` seul ne se remarque pas à la lecture.
      + (compteurs.recredited > 0
        ? `  🚨 ${compteurs.recredited} paiement(s) refermé(s) à tort puis encaissé(s) : crédités`
        : '');

    this.ecrire('OK', dureeMs, detail);
  }

  passageIgnore() {
    this.ecrire('IGNORE', null, 'passage précédent encore en cours');
  }

  passageDesarme() {
    this.ecrire(
      'DESARME',
      null,
      'HUB_SYNC_CRON_ENABLED=false - aucun paiement n est crédité',
    );
  }

  passageEnErreur(message: string, dureeMs: number | null) {
    this.ecrire('ERREUR', dureeMs, message.replace(/\s+/g, ' ').slice(0, 500));
  }

  // ───────────────────────────────────────────────────────────────────────────────────────

  private ecrire(issue: IssuePassage, dureeMs: number | null, detail: string) {
    const fichier = this.fichier;
    if (!fichier) return;

    try {
      this.preparerFichier(fichier);

      const horodatage = new Date().toISOString();
      const duree = dureeMs === null ? '-' : `${(dureeMs / 1000).toFixed(1)}s`;
      const ligne =
        `${horodatage} | ${LIBELLES[issue].padEnd(9)} | ${duree.padStart(7)} | ${detail}\n`;

      fs.appendFileSync(fichier, ligne, 'utf8');
    } catch {
      // Volontairement muet : cf. l en-tête. Un journal ne casse pas ce qu il observe.
    }
  }

  /** Crée le dossier, pose l en-tête sur un fichier neuf, bascule un fichier trop gros. */
  private preparerFichier(fichier: string) {
    const dossier = path.dirname(fichier);
    if (!fs.existsSync(dossier)) fs.mkdirSync(dossier, { recursive: true });

    if (!fs.existsSync(fichier)) {
      fs.writeFileSync(fichier, EN_TETE, 'utf8');
      return;
    }

    // Bascule : on ne garde qu UNE génération précédente. Le fichier sert à voir les jours
    // qui viennent de s écouler, pas à archiver - l historique complet vit dans pm2.
    if (fs.statSync(fichier).size >= TAILLE_MAX_OCTETS) {
      fs.renameSync(fichier, `${fichier}.1`);
      fs.writeFileSync(fichier, EN_TETE, 'utf8');
    }
  }
}

/** Instance partagée par le cron. Les tests en construisent une avec un chemin explicite. */
export const hubSyncJournal = new HubSyncJournal();
