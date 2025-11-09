import { GlobalStatus } from 'src/shared/enums/global-status.enum';
import { slugify } from 'transliteration';
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
} from 'typeorm';

export enum CategoryDonate {
  FIXED_AMOUNT = 'fixed_amount',
  FREE_AMOUNT = 'free_amount',
}

@Entity({ name: 'donates' })
export class Donate {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'char', length: 36, unique: true, default: () => '(UUID())' })
  uuid: string;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column()
  start_at: Date;

  @Column()
  stop_at: Date;

  @Column({
  type: 'enum',
  enum: CategoryDonate,
  default: CategoryDonate.FREE_AMOUNT,
  })
  category: CategoryDonate;

  @Column({
  type: 'enum',
  enum: GlobalStatus,
  default: GlobalStatus.STARTED,
  })
  status: GlobalStatus;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  amount: number;

  @Column({ type: 'int', nullable: true })
  donate_number?: number;

  @Column({ type: 'longtext'})
  history: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at', nullable: true })
  deletedAt?: Date;
}
