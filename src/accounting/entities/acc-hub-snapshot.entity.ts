import { randomUUID } from 'crypto';
import { BeforeInsert, Column, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { DateTimeEntity } from 'src/shared/entities/date-time.entity';

/** D'où viennent les chiffres HUB2 de l'instantané. */
export enum SnapshotKind {
  /** Interrogation de la liste marchande du guichet (quasi temps réel). */
  GATEWAY = 'gateway',
  /** Import d'un export HUB2 : la preuve périodique, qui fait foi. */
  EXPORT = 'export',
}

/**
 * Un instantané de concordance : les totaux des deux côtés à un moment donné, et leur écart.
 *
 * ⚠️ **Rien ici n'est une vérité sur un paiement** : ces colonnes sont des AGRÉGATS constatés,
 * conservés pour l'historique. La vérité de l'argent reste `payments`.
 */
@Entity({ name: 'acc_hub_snapshots' })
export class AccHubSnapshotEntity extends DateTimeEntity {
  @PrimaryGeneratedColumn()
  id: number;

  // Pas de `default: () => '(UUID())'` : blocage binlog STATEMENT connu sur cette base, et
  // `synchronize` étant off, un défaut déclaré ici n'atteindrait jamais le schéma réel.
  @Column({ type: 'char', length: 36, unique: true })
  uuid: string;

  @BeforeInsert()
  ensureUuid() {
    this.uuid = this.uuid ?? randomUUID();
  }

  @Column({ type: 'enum', enum: SnapshotKind })
  kind: SnapshotKind;

  @Column({ type: 'varchar', length: 191 })
  label: string;

  @Column({ type: 'datetime', nullable: true })
  period_start: Date | null;

  @Column({ type: 'datetime', nullable: true })
  period_end: Date | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  imported_file: string | null;

  @Column({ type: 'char', length: 36, nullable: true })
  created_by_uuid: string | null;

  /**
   * Solde du compte de collecte HUB2 **avant mise en service** (196 XOF, constaté le 24/07).
   *
   * ⚠️ Conservé sur l'instantané, et non en constante : c'est une ligne du décompte affiché
   * (`ouverture + encaissements − frais = solde HUB2`). Le rapprochement du 09/08 ne s'est
   * fermé qu'avec lui ; enfoui dans une formule, il produirait un écart permanent de 196 XOF
   * sans catégorie, et « 0 ligne inexpliquée » deviendrait inatteignable.
   */
  @Column({ type: 'decimal', precision: 14, scale: 2, default: 196 })
  opening_balance: string;

  @Column({ type: 'int', default: 0 })
  hub_total_count: number;

  @Column({ type: 'int', default: 0 })
  hub_success_count: number;

  @Column({ type: 'decimal', precision: 14, scale: 2, default: 0 })
  hub_gross: string;

  @Column({ type: 'decimal', precision: 14, scale: 2, default: 0 })
  hub_fees: string;

  @Column({ type: 'decimal', precision: 14, scale: 2, default: 0 })
  hub_net: string;

  @Column({ type: 'int', default: 0 })
  app_success_count: number;

  @Column({ type: 'decimal', precision: 14, scale: 2, default: 0 })
  app_gross: string;

  @Column({ type: 'decimal', precision: 14, scale: 2, default: 0 })
  app_fees_theoretical: string;

  @Column({ type: 'decimal', precision: 14, scale: 2, default: 0 })
  app_net: string;

  @Column({ type: 'decimal', precision: 14, scale: 2, default: 0 })
  gap_gross: string;

  @Column({ type: 'decimal', precision: 14, scale: 2, default: 0 })
  gap_net: string;

  @Column({ type: 'int', default: 0 })
  matched_count: number;

  @Column({ type: 'int', default: 0 })
  unmatched_hub_count: number;

  @Column({ type: 'int', default: 0 })
  unmatched_app_count: number;

  @Column({ type: 'int', default: 0 })
  mismatch_count: number;

  /**
   * Vrai si la lecture du guichet a été écourtée (pagination bornée).
   *
   * ⚠️ Un instantané tronqué annonce un écart imaginaire : il doit se dénoncer lui-même plutôt
   * que de présenter un chiffre faux avec assurance.
   */
  @Column({ type: 'bool', default: false })
  truncated: boolean;
}
