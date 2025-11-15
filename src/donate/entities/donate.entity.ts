import { DateTimeEntity } from 'src/shared/entities/date-time.entity';
import { DonateCategory } from 'src/shared/enums/donate.enum';
import { GlobalStatus } from 'src/shared/enums/global-status.enum';
import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('donates')
export class DonateEntity extends DateTimeEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'char', length: 36, unique: true, default: () => '(UUID())' })
  uuid: string;

  @Column({ nullable: false, length: 191 })
  name: string;

  @Column({ nullable: false, type: 'date' })
  starts_at: Date;

  @Column({ nullable: false, type: 'date' })
  stops_at: Date;

  @Column({ nullable: false, type: 'enum', enum: DonateCategory })
  category: string;

  @Column({ nullable: true, default: 0, type: 'double' })
  amount: number;

  @Column({ type: 'int', nullable: true })
  max_payments_per_beneficiary: number | null;



  @Column({ nullable: true, type: 'text' })
  history: string;

  @Column({ nullable: true, length: 191 })
  admin_uuid: string;

  @Column({
    nullable: false,
    type: 'enum',
    enum: GlobalStatus,
    default: GlobalStatus.CREATED,
  })
  status: string;
}
