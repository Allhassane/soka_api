import { DateTimeEntity } from 'src/shared/entities/date-time.entity';
import { MemberEntity } from 'src/members/entities/member.entity';
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  Unique,
  BeforeInsert,
  Index,
} from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { ActivityEntity } from './activity.entity';

@Entity({ name: 'activity_attendances' })
@Unique('uniq_attendance_activity_member', ['activity_uuid', 'member_uuid'])
export class ActivityAttendanceEntity extends DateTimeEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'char', length: 36, unique: true })
  uuid: string;

  @BeforeInsert()
  ensureUuid() {
    this.uuid = this.uuid ?? uuidv4();
  }

  @Index()
  @Column({ type: 'varchar', length: 36 })
  activity_uuid: string;

  @ManyToOne(() => ActivityEntity, (a) => a.attendances, { nullable: false })
  @JoinColumn({ name: 'activity_uuid', referencedColumnName: 'uuid' })
  activity: ActivityEntity;

  @Index()
  @Column({ type: 'varchar', length: 36 })
  member_uuid: string;

  @ManyToOne(() => MemberEntity, { nullable: false })
  @JoinColumn({ name: 'member_uuid', referencedColumnName: 'uuid' })
  member: MemberEntity;

  @Column({ type: 'boolean', default: false })
  present: boolean;

  @Column({ type: 'datetime', nullable: true })
  arrived_at: Date | null;

  @Column({ type: 'varchar', length: 36 })
  marked_by_admin_uuid: string;

  @Column({ type: 'text', nullable: true })
  comment: string | null;
}
