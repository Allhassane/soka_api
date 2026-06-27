import { DateTimeEntity } from 'src/shared/entities/date-time.entity';
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  OneToMany,
  JoinColumn,
  BeforeInsert,
  Index,
} from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { ActivityEntity } from './activity.entity';
import { ActivityCommitteeMemberEntity } from './activity-committee-member.entity';

@Entity({ name: 'activity_committees' })
export class ActivityCommitteeEntity extends DateTimeEntity {
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
  activity_uuid: string;

  @ManyToOne(() => ActivityEntity, { nullable: false, createForeignKeyConstraints: false })
  @JoinColumn({ name: 'activity_uuid', referencedColumnName: 'uuid' })
  activity: ActivityEntity;

  @Column({ type: 'varchar', length: 191 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'varchar', length: 36, default: 'active' })
  status: string;

  @Column({ type: 'char', length: 36 })
  admin_uuid: string;

  @OneToMany(() => ActivityCommitteeMemberEntity, (m) => m.committee)
  members: ActivityCommitteeMemberEntity[];
}
