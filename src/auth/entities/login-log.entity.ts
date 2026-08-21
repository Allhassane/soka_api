import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

/**
 * Issue d'une tentative de connexion. Valeurs FIGÉES : elles sont écrites en base et
 * agrégées par le module Statistiques ; en renommer une couperait l'historique en deux.
 */
export const LOGIN_OUTCOMES = [
  /** Session délivrée : le membre est entré. */
  'success',
  /** Identifiants BONS mais compte encore au mot de passe par défaut : un nouveau mot de
   *  passe part par SMS et AUCUNE session n'est délivrée (cf. `handleFirstLogin`). Ce
   *  n'est ni un succès ni un échec - le compter comme un succès gonflerait le taux de
   *  connexion d'entrées qui n'en sont pas. */
  'first_login',
  /** Numéro connu, mot de passe faux. */
  'bad_password',
  /** Aucun compte pour ce numéro. */
  'unknown_identifier',
  /** Compte trouvé mais désactivé. */
  'inactive_account',
] as const;

export type LoginOutcome = (typeof LOGIN_OUTCOMES)[number];

/**
 * **Journal des tentatives de connexion** (2026-08-19).
 *
 * **Pourquoi cette table existe.** Jusqu'ici l'application savait *qu'un* compte s'était
 * connecté un jour (`users.is_connected`, un booléen posé une seule fois dans la vie du
 * compte) - jamais **quand**, **combien de fois**, ni **combien d'échecs**. Tout indicateur
 * d'usage (membres actifs sur 30 jours, fréquence, heures d'affluence, taux d'échec) était
 * donc hors d'atteinte, et `log_activities` ne trace que des actions métier, jamais un
 * login.
 *
 * ⚠️ **Elle n'a aucun effet rétroactif** : l'historique commence à sa mise en service.
 *
 * **Second usage, sécurité** : un mot de passe fait 4 chiffres (10 000 valeurs) et rien ne
 * limite les tentatives sur `POST /auth/login` (dette relevée le 2026-08-02). Les échecs
 * groupés par IP et par compte sont le seul moyen de **voir** un balayage. Cette table ne
 * bloque rien - elle rend visible.
 *
 * 🚨 **Elle ne contient JAMAIS de mot de passe**, ni en clair ni haché.
 */
@Entity('login_logs')
@Index('IDX_login_logs_created_at', ['created_at'])
@Index('IDX_login_logs_user_uuid', ['user_uuid'])
@Index('IDX_login_logs_outcome_created', ['outcome', 'created_at'])
@Index('IDX_login_logs_ip_created', ['ip', 'created_at'])
export class LoginLogEntity {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: string;

  @CreateDateColumn({ type: 'datetime', precision: 6 })
  created_at: Date;

  /**
   * Compte concerné. **NULL quand le numéro saisi ne correspond à aucun compte** : c'est
   * précisément la ligne qui révèle un balayage, elle ne doit pas être perdue faute de
   * clé. Aucune contrainte de clé étrangère, pour la même raison (et pour qu'une
   * suppression de compte n'efface pas son historique).
   */
  @Column({ type: 'char', length: 36, nullable: true })
  user_uuid: string | null;

  /**
   * Identifiant SAISI (numéro de téléphone normalisé). Conservé même quand le compte est
   * connu : c'est ce qui permet de reconstituer une série de tentatives sur un numéro qui
   * n'existe pas.
   */
  @Column({ type: 'varchar', length: 191, nullable: true })
  identifier: string | null;

  @Column({ type: 'varchar', length: 32 })
  outcome: LoginOutcome;

  /** IPv4 ou IPv6 (45 caractères couvrent le format IPv6 le plus long). */
  @Column({ type: 'varchar', length: 45, nullable: true })
  ip: string | null;

  /** Tronqué à 255 caractères : sert à distinguer un navigateur d'un script, rien de plus. */
  @Column({ type: 'varchar', length: 255, nullable: true })
  user_agent: string | null;
}
