import { Entity, PrimaryGeneratedColumn, Column, Index } from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { DateTimeEntity } from 'src/shared/entities/date-time.entity';
import { GlobalStatus } from 'src/shared/enums/global-status.enum';

/**
 * Liaison « membre ↔ session/lien SOKA Pay ↔ paiement ».
 *
 * Créée à l'ouverture d'un checkout/lien via SOKA Pay (statut PENDING), puis
 * passée à SUCCESS/FAILED par le webhook signé reçu de SOKA Pay - de façon
 * IDEMPOTENTE (un même événement n'est appliqué qu'une fois, rejouable sans
 * double comptage). Module 100 % isolé : ne modifie aucune table existante.
 */
@Entity({ name: 'sokapay_transactions' })
export class SokaPayTransactionEntity extends DateTimeEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @ApiProperty()
  @Column({ type: 'char', length: 36, unique: true, default: () => '(UUID())' })
  uuid: string;

  /** Identifiant de session SOKA Pay (`psess_…`), si checkout par session. */
  @Index()
  @Column({ type: 'varchar', length: 64, nullable: true })
  provider_session_id: string | null;

  /** Identifiant de lien SOKA Pay (`plink_…`), si checkout par lien. */
  @Index()
  @Column({ type: 'varchar', length: 64, nullable: true })
  provider_link_id: string | null;

  /** Identifiant de paiement SOKA Pay (`pay_…`), renseigné au règlement. */
  @Column({ type: 'varchar', length: 64, nullable: true })
  provider_payment_id: string | null;

  /** Dernier `event.id` appliqué (idempotence des webhooks). */
  @Column({ type: 'varchar', length: 64, nullable: true })
  last_event_id: string | null;

  /** Référence libre (echo de `customerReference`). */
  @Column({ type: 'varchar', length: 191, nullable: true })
  reference: string | null;

  /** Membre cotisant (FK logique vers members.uuid). */
  @Index()
  @Column({ type: 'char', length: 36, nullable: true })
  member_uuid: string | null;

  /** Campagne d'abonnement liée (subscriptions.uuid). */
  @Column({ type: 'char', length: 36, nullable: true })
  subscription_uuid: string | null;

  /** Cotisation interne liée (subscription_payments.uuid), marquée réglée au succès. */
  @Column({ type: 'char', length: 36, nullable: true })
  subscription_payment_uuid: string | null;

  @Column({ type: 'int' })
  amount: number;

  @Column({ type: 'varchar', length: 8, default: 'XOF' })
  currency: string;

  @Column({ type: 'varchar', length: 32, nullable: true })
  provider: string | null;

  @Column({ type: 'enum', enum: GlobalStatus, default: GlobalStatus.PENDING })
  status: GlobalStatus;

  /** URL du guichet (lien/session) renvoyée au front SOKA. */
  @Column({ type: 'text', nullable: true })
  checkout_url: string | null;

  /** Dernier événement reçu (audit / rejeu). */
  @Column({ type: 'json', nullable: true })
  raw_event: unknown | null;
}
