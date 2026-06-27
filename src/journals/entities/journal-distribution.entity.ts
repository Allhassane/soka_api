import { DateTimeEntity } from 'src/shared/entities/date-time.entity';
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  BeforeInsert,
  Index,
} from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { JournalEditionEntity } from './journal-edition.entity';
import { JournalZoneEntity } from './journal-zone.entity';

export enum JournalDistributionStatus {
  PENDING = 'pending',
  NOTIFIED = 'notified',
  IN_PROGRESS = 'in_progress',
  DELIVERED = 'delivered',
  LATE = 'late',
  CANCELED = 'canceled',
}

export enum NotificationChannel {
  SMS = 'sms',
  WHATSAPP = 'whatsapp',
}

/**
 * Distribution d'une édition vers une ZONE (1 ligne par zone).
 * La quantité provient du besoin dérivé des abonnements ; l'alerte part au
 * responsable de la zone. Trace l'envoi et la confirmation de réception.
 */
@Entity({ name: 'journal_distributions' })
export class JournalDistributionEntity extends DateTimeEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'char', length: 36, unique: true })
  uuid: string;

  @BeforeInsert()
  ensureUuid() {
    this.uuid = this.uuid ?? uuidv4();
  }

  @Index()
  @Column({ type: 'char', length: 36 })
  edition_uuid: string;

  @ManyToOne(() => JournalEditionEntity, { nullable: false })
  @JoinColumn({ name: 'edition_uuid', referencedColumnName: 'uuid' })
  edition: JournalEditionEntity;

  @Index()
  @Column({ type: 'char', length: 36 })
  zone_uuid: string;

  @ManyToOne(() => JournalZoneEntity, {
    nullable: false,
    createForeignKeyConstraints: false,
  })
  @JoinColumn({ name: 'zone_uuid', referencedColumnName: 'uuid' })
  zone: JournalZoneEntity;

  /** Quantité prévue / envoyée / livrée */
  @Column({ type: 'int', default: 0 })
  expected_quantity: number;

  @Column({ type: 'int', default: 0 })
  sent_quantity: number;

  @Column({ type: 'int', default: 0 })
  delivered_quantity: number;

  @Column({
    type: 'enum',
    enum: JournalDistributionStatus,
    default: JournalDistributionStatus.PENDING,
  })
  status: JournalDistributionStatus;

  @Column({
    type: 'enum',
    enum: NotificationChannel,
    default: NotificationChannel.SMS,
  })
  channel: NotificationChannel;

  /** Horodatages */
  @Column({ type: 'datetime', nullable: true })
  notified_at: Date | null;

  @Column({ type: 'datetime', nullable: true })
  sent_at: Date | null;

  @Column({ type: 'datetime', nullable: true })
  delivered_at: Date | null;

  /** Dernier message envoyé + nombre de relances */
  @Column({ type: 'text', nullable: true })
  last_message: string | null;

  @Column({ type: 'int', default: 0 })
  retry_count: number;

  @Column({ type: 'longtext', nullable: true })
  history: string;

  @Column({ type: 'char', length: 36 })
  admin_uuid: string;
}
