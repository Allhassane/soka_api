import { DateTimeEntity } from 'src/shared/entities/date-time.entity';
import { GlobalStatus } from 'src/shared/enums/global-status.enum';
import { StructureEntity } from 'src/structure/entities/structure.entity';
import { ActivityTypeEntity } from 'src/activity-types/entities/activity-type.entity';
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  OneToMany,
  BeforeInsert,
  Index,
} from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { ActivityParticipantEntity } from './activity-participant.entity';
import { ActivityAttendanceEntity } from './activity-attendance.entity';

export enum ActivityTargetScope {
  ALL_MEMBERS = 'all_members',
  RESPONSABLES_ONLY = 'responsables_only',
  MIXED = 'mixed',
}

export enum ActivityTargetGender {
  HOMME = 'homme',
  FEMME = 'femme',
}

@Entity({ name: 'activities' })
export class ActivityEntity extends DateTimeEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'char', length: 36, unique: true })
  uuid: string;

  @BeforeInsert()
  ensureUuid() {
    this.uuid = this.uuid ?? uuidv4();
  }

  @Column({ type: 'varchar', length: 191 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  type: string | null;

  @Column({ type: 'char', length: 36, nullable: true })
  activity_type_uuid: string | null;

  @ManyToOne(() => ActivityTypeEntity, { nullable: true, createForeignKeyConstraints: false })
  @JoinColumn({ name: 'activity_type_uuid', referencedColumnName: 'uuid' })
  activityType: ActivityTypeEntity | null;

  @Column({ type: 'varchar', length: 191, nullable: true })
  location: string | null;

  @Index()
  @Column({ type: 'datetime' })
  starts_at: Date;

  @Column({ type: 'datetime' })
  ends_at: Date;

  @Column({ type: 'int', nullable: true })
  capacity: number | null;

  @Column({ type: 'int', nullable: true })
  quota_per_centre: number | null;

  @Column({ type: 'boolean', default: false })
  is_recurring: boolean;

  @Column({ type: 'varchar', length: 255, nullable: true })
  recurrence_rule: string | null;

  @Column({ type: 'longtext', nullable: true })
  organigram: string | null;

  @Column({ type: 'char', length: 36, nullable: true })
  structure_uuid: string | null;

  @ManyToOne(() => StructureEntity, { nullable: true, createForeignKeyConstraints: false })
  @JoinColumn({ name: 'structure_uuid', referencedColumnName: 'uuid' })
  structure: StructureEntity | null;

  @Column({
    type: 'enum',
    enum: ActivityTargetScope,
    default: ActivityTargetScope.ALL_MEMBERS,
  })
  target_scope: ActivityTargetScope;

  @Column({ type: 'longtext', nullable: true })
  target_structures: string | null;

  @Column({ type: 'longtext', nullable: true })
  target_levels: string | null;

  @Column({ type: 'longtext', nullable: true })
  target_responsibilities: string | null;

  @Column({ type: 'longtext', nullable: true })
  target_responsibility_levels: string | null;

  @Column({ type: 'longtext', nullable: true })
  target_departments: string | null;

  @Column({ type: 'boolean', default: false })
  include_descendants: boolean;

  @Column({
    type: 'enum',
    enum: ActivityTargetGender,
    nullable: true,
  })
  target_gender: ActivityTargetGender | null;

  @Column({ type: 'longtext', nullable: true })
  history: string;

  @Column({ type: 'char', length: 36 })
  admin_uuid: string;

  @Column({ type: 'enum', enum: GlobalStatus, default: GlobalStatus.CREATED })
  status: string;

  @OneToMany(() => ActivityParticipantEntity, (p) => p.activity)
  participants: ActivityParticipantEntity[];

  @OneToMany(() => ActivityAttendanceEntity, (a) => a.activity)
  attendances: ActivityAttendanceEntity[];
}
