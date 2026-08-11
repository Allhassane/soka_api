import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { DateTimeEntity } from 'src/shared/entities/date-time.entity';
import { PaymentSource } from '../dto/create-payment.dto';
import { MemberEntity } from 'src/members/entities/member.entity';
import { GlobalStatus } from 'src/shared/enums/global-status.enum';

export enum PaymentStatus {
  PENDING = 'pending',
  PAID = 'paid',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
}

@Entity({ name: 'payments' })
export class PaymentEntity extends DateTimeEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'char', length: 36, unique: true, default: () => '(UUID())' })
  uuid: string;

  // -----------------------------------------------------------
  // Source du paiement
  // -----------------------------------------------------------

  @Column({ type: 'enum', enum: PaymentSource })
  source: PaymentSource;

  @Column({ type: 'char', length: 36 })
  source_uuid: string;

  // -----------------------------------------------------------
  // Beneficiary
  // -----------------------------------------------------------

  @Column({ type: 'char', length: 36 })
  beneficiary_uuid: string;

  @Column({ type: 'varchar', length: 191 })
  beneficiary_name: string;

  @ManyToOne(() => MemberEntity, { nullable: false })
  @JoinColumn({ name: 'beneficiary_uuid', referencedColumnName: 'uuid' })
  beneficiary: MemberEntity;


  // -----------------------------------------------------------
  // Actor
  // -----------------------------------------------------------

  @Column({ type: 'char', length: 36,nullable:false })
  actor_uuid: string;

  @Column({ type: 'varchar', length: 191 })
  actor_name: string;

  @ManyToOne(() => MemberEntity, { nullable: false })
  @JoinColumn({ name: 'actor_uuid', referencedColumnName: 'uuid' })
  actor: MemberEntity;

  // -----------------------------------------------------------
  // Montant & Quantité
  // -----------------------------------------------------------

  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true })
  amount: number | null;

  @Column({ type: 'int', nullable: true })
  quantity: number | null;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  total_amount: number;

  // -----------------------------------------------------------
  // Statut général
  // -----------------------------------------------------------

  @Column({
    type: 'enum',
    enum: GlobalStatus,
    default: GlobalStatus.INIT,
  })
  status: GlobalStatus;

  // -----------------------------------------------------------
  // Paiement CinetPay
  // -----------------------------------------------------------

  @Column({ type: 'varchar', length: 191, nullable: true })
  transaction_id: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  payment_url: string;

  @Column({
    type: 'enum',
    enum: PaymentStatus,
    default: PaymentStatus.PENDING,
  })
  payment_status: PaymentStatus;

  // -----------------------------------------------------------
  // Détail rendu par le guichet (SOKA Pay → HUB2)
  //
  // Ces six colonnes sont alimentées par `PaymentService.captureHubPaymentDetails`,
  // à l'unique endroit où la réponse du guichet est lue. Elles n'ont AUCUN rôle dans le
  // parcours de paiement : elles existent pour que les statistiques puissent répondre
  // « par quel opérateur » et « pourquoi ça a échoué », deux questions auxquelles la
  // base était muette (le guichet renvoyait déjà l'information, l'API la jetait).
  //
  // ⚠️ Toutes nullables, et elles le restent : un paiement jamais engagé au guichet
  // n'a ni opérateur ni motif. Une valeur déjà capturée n'est jamais écrasée par un
  // `null` d'une synchronisation ultérieure.
  // -----------------------------------------------------------

  /** Opérateur Mobile Money ayant traité la tentative : `wave`, `orange`, `mtn`, `moov`. */
  @Column({ type: 'varchar', length: 32, nullable: true })
  provider: string | null;

  /** Code d'échec du guichet (`wave_payment_expired`, `timeout`, `authentication_failed`…). */
  @Column({ type: 'varchar', length: 64, nullable: true })
  failure_code: string | null;

  /** Message d'échec en clair, tel que rendu par le guichet. */
  @Column({ type: 'text', nullable: true })
  failure_message: string | null;

  /** Horodatage d'encaissement chez l'opérateur (≠ `updated_at`, qui est celui de l'API). */
  @Column({ type: 'datetime', nullable: true })
  paid_at: Date | null;

  /**
   * Identifiant de la transaction au guichet HUB2 (`pay_…`) - LA clé de rapprochement avec
   * l'export HUB2 (concordance « Solde HUB2 = Solde App »). Sans elle, le rapprochement retombe
   * sur des heuristiques montant + date et laisse des écarts inexplicables.
   *
   * ⚠️ **Volontairement NON UNIQUE en base.** Une ligne `payments` est un LIEN, pas une
   * transaction : sur un lien jamais abouti, le guichet peut rendre une tentative différente
   * d'un appel à l'autre (il privilégie la réussie, sinon la dernière). Un index unique
   * ferait échouer la synchronisation sur un cas parfaitement normal.
   */
  @Column({ type: 'varchar', length: 40, nullable: true })
  hub_payment_id: string | null;

  /**
   * Création de la transaction chez HUB2 = vrai départ de la tentative.
   *
   * ⚠️ À ne pas confondre avec `created_at`, qui date la création du **lien** de paiement. Un
   * membre qui reçoit son lien à 9 h, l'ouvre à 12 h et paie en 40 s doit compter ~40 s, pas
   * 3 h : c'est la seule base saine du « délai de confirmation ».
   */
  @Column({ type: 'datetime', nullable: true })
  hub_created_at: Date | null;
}
