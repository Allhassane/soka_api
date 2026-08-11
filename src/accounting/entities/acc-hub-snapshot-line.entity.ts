import { randomUUID } from 'crypto';
import {
  BeforeInsert,
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * Verdict du RAPPROCHEMENT d'une ligne d'export.
 *
 * 🚨 À ne jamais confondre avec `payments.payment_status` : ceci qualifie un appariement, pas un
 * paiement. Les mélanger créerait une seconde vérité sur l'argent.
 */
export enum MatchStatus {
  /** Apparié, montants et statuts cohérents. */
  MATCHED = 'matched',
  /** Le guichet connaît cette transaction, l'application non. */
  UNMATCHED_HUB = 'unmatched_hub',
  /** Apparié, mais les montants divergent. */
  AMOUNT_MISMATCH = 'amount_mismatch',
  /** Apparié, mais l'un dit encaissé et l'autre non. */
  STATUS_MISMATCH = 'status_mismatch',
}

/**
 * Le détail ligne à ligne d'un instantané d'export : c'est ce qui donne un NOM à chaque franc
 * d'écart. Un écart sans décomposition n'est qu'un nombre dont personne ne sait quoi faire.
 */
@Entity({ name: 'acc_hub_snapshot_lines' })
export class AccHubSnapshotLineEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'char', length: 36, unique: true })
  uuid: string;

  @BeforeInsert()
  ensureUuid() {
    this.uuid = this.uuid ?? randomUUID();
  }

  @Column({ type: 'char', length: 36 })
  snapshot_uuid: string;

  /**
   * `paymentId` de l'export = **identifiant HUB2** (`pay_…`, 25 caractères).
   *
   * 🚨 Ce n'est **pas** `payments.hub_payment_id` de l'application, qui porte l'identifiant du
   * **guichet** (28 caractères). Les deux sont préfixés `pay_` et ne sont jamais égaux : sur les
   * 1 400 lignes de l'export de référence, 1 383 s'apparient par l'identifiant HUB2 et **0** par
   * celui du guichet. Le pont entre les deux est `linkId` de la liste marchande du guichet.
   */
  @Column({ type: 'varchar', length: 40 })
  hub_payment_id: string;

  @Column({ type: 'varchar', length: 32 })
  hub_status: string;

  @Column({ type: 'decimal', precision: 14, scale: 2, default: 0 })
  amount: string;

  @Column({ type: 'decimal', precision: 14, scale: 2, default: 0 })
  fees: string;

  @Column({ type: 'varchar', length: 32, nullable: true })
  provider: string | null;

  @Column({ type: 'varchar', length: 32, nullable: true })
  msisdn: string | null;

  @Column({ type: 'datetime', nullable: true })
  hub_created_at: Date | null;

  @Column({ type: 'varchar', length: 191, nullable: true })
  purchase_reference: string | null;

  @Column({ type: 'char', length: 36, nullable: true })
  matched_payment_uuid: string | null;

  @Column({ type: 'enum', enum: MatchStatus })
  match_status: MatchStatus;

  /**
   * Vrai quand l'appariement repose sur un repli (montant + fenêtre temporelle) et non sur la
   * clé forte. ⚠️ Jamais silencieux : un rapprochement deviné doit se signaler, sinon il se
   * fait passer pour une preuve.
   */
  @Column({ type: 'bool', default: false })
  heuristic: boolean;

  @Column({ type: 'text', nullable: true })
  resolution_note: string | null;

  @Column({ type: 'char', length: 36, nullable: true })
  resolved_by_uuid: string | null;

  @Column({ type: 'datetime', nullable: true })
  resolved_at: Date | null;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
