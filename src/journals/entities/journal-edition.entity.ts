import { DateTimeEntity } from 'src/shared/entities/date-time.entity';
import { GlobalStatus } from 'src/shared/enums/global-status.enum';
import { SubscriptionEntity } from 'src/subscriptions/entities/subscription.entity';
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

/**
 * Édition mensuelle du journal (ex : "Le Serment du Bonheur N°068 - Avril 2026").
 * Rattachée à la campagne d'abonnement (SubscriptionEntity) car les bénéficiaires
 * d'un paiement d'abonnement sont les destinataires des éditions.
 * Le délai maximum de distribution est de 2 jours après la date de lancement.
 */
@Entity({ name: 'journal_editions' })
export class JournalEditionEntity extends DateTimeEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'char', length: 36, unique: true })
  uuid: string;

  @BeforeInsert()
  ensureUuid() {
    this.uuid = this.uuid ?? uuidv4();
  }

  /** Numéro de l'édition (ex : 68 pour N°068) */
  @Index()
  @Column({ type: 'int' })
  number: number;

  /** Titre du journal (ex : "Le Serment du Bonheur") */
  @Column({ type: 'varchar', length: 191 })
  title: string;

  /** Mois (1-12) et année */
  @Column({ type: 'int' })
  month: number;

  @Column({ type: 'int' })
  year: number;

  /** Campagne d'abonnement associée (les bénéficiaires reçoivent ce journal) */
  @Column({ type: 'char', length: 36, nullable: true })
  subscription_uuid: string | null;

  @ManyToOne(() => SubscriptionEntity, { nullable: true, createForeignKeyConstraints: false })
  @JoinColumn({ name: 'subscription_uuid', referencedColumnName: 'uuid' })
  subscription: SubscriptionEntity | null;

  /** Date de lancement de la distribution */
  @Column({ type: 'datetime' })
  distribution_start_at: Date;

  /**
   * Date limite de distribution (= distribution_start_at + 2 jours).
   * Calculée automatiquement côté service.
   */
  @Column({ type: 'datetime' })
  distribution_deadline_at: Date;

  /** Tirage total / quantité imprimée */
  @Column({ type: 'int', default: 0 })
  total_printed: number;

  /** Photo de couverture (URL relative, ex : /uploads/journals/xxx.jpg) — facultatif */
  @Column({ type: 'varchar', length: 255, nullable: true })
  cover_image: string | null;

  /** Version numérique de l'édition (URL relative du PDF) — facultatif */
  @Column({ type: 'varchar', length: 255, nullable: true })
  digital_file: string | null;

  @Column({ type: 'longtext', nullable: true })
  history: string;

  @Column({ type: 'char', length: 36 })
  admin_uuid: string;

  @Column({ type: 'enum', enum: GlobalStatus, default: GlobalStatus.CREATED })
  status: string;
}
