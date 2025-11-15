import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
} from 'typeorm';
import { DateTimeEntity } from 'src/shared/entities/date-time.entity';
import { GlobalStatus } from 'src/shared/enums/global-status.enum';

@Entity({ name: 'donate_payments' })
export class DonatePaymentEntity extends DateTimeEntity {

  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'char', length: 36, unique: true, default: () => '(UUID())' })
  uuid: string;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  amount: number;

  @Column({ type: 'char', length: 36 })
  beneficiary_uuid: string;

  @Column({ type: 'varchar', length: 255 })
  beneficiary_name: string;

  @Column({ type: 'char', length: 36 })
  actor_uuid: string;

  @Column({ type: 'varchar', length: 255 })
  actor_name: string;

  @Column({ type: 'char', length: 36 })
  donate_uuid: string;
  @Column({ type: 'char', length: 36 })
  payment_uuid: string;

  @Column({
    type: 'enum',
    enum: GlobalStatus,
    default: GlobalStatus.PENDING,
  })
  status: GlobalStatus;
}

