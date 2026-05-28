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

export enum ActivityParticipantRole {
  PARTICIPANT = 'participant',
  ORGANISATEUR = 'organisateur',
  INTERVENANT = 'intervenant',
  INVITE = 'invite',
}

@Entity({ name: 'activity_participants' })
@Unique('uniq_activity_member', ['activity_uuid', 'member_uuid'])
export class ActivityParticipantEntity extends DateTimeEntity {
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

  @ManyToOne(() => ActivityEntity, (a) => a.participants, { nullable: false })
  @JoinColumn({ name: 'activity_uuid', referencedColumnName: 'uuid' })
  activity: ActivityEntity;

  @Index()
  @Column({ type: 'varchar', length: 36 })
  member_uuid: string;

  @ManyToOne(() => MemberEntity, { nullable: false })
  @JoinColumn({ name: 'member_uuid', referencedColumnName: 'uuid' })
  member: MemberEntity;

  @Column({
    type: 'enum',
    enum: ActivityParticipantRole,
    default: ActivityParticipantRole.PARTICIPANT,
  })
  role: ActivityParticipantRole;

  /** Structure du membre au moment de l'invitation (pour stats historiques) */
  @Column({ type: 'varchar', length: 36, nullable: true })
  structure_uuid_at_invitation: string | null;

  @Column({ type: 'varchar', length: 36 })
  admin_uuid: string;
}
