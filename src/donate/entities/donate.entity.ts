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

  @Column({ nullable: false })
  name: string;

  @Column({ nullable: false })
  structure_uuid: string;

  @Column({ nullable: false })
  starts_at: Date;

  @Column({ nullable: false })
  stops_at: Date;

  @Column({ nullable: false, type: 'enum', enum: DonateCategory })
  category: string;

  @Column({ nullable: true, type: 'longtext' })
  history: string;

  @Column({ nullable: true })
  admin_uuid: string;

  @Column({
    nullable: false,
    type: 'enum',
    enum: GlobalStatus,
    default: GlobalStatus.CREATED,
  })
  status: string;
}
