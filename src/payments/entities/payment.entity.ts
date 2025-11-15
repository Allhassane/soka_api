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
  PENDING = 'PENDING',
  PAID = 'PAID',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED',
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
}
