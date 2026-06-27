import { DateTimeEntity } from 'src/shared/entities/date-time.entity';
import { MemberEntity } from 'src/members/entities/member.entity';
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
import { ActivityCommitteeEntity } from './activity-committee.entity';

export enum CommitteeMemberRole {
  PRESIDENT = 'president',
  SECRETAIRE = 'secretaire',
  MEMBRE = 'membre',
}

export enum CommissionType {
  ACCUEIL = 'accueil',
  ENREGISTREMENT = 'enregistrement',
  PODIUM = 'podium',
  SECRETARIAT = 'secretariat',
  ENTRETIEN = 'entretien',
  AUTRE = 'autre',
}

@Entity({ name: 'activity_committee_members' })
export class ActivityCommitteeMemberEntity extends DateTimeEntity {
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
  committee_uuid: string;

  @ManyToOne(() => ActivityCommitteeEntity, (c) => c.members, { nullable: false, createForeignKeyConstraints: false })
  @JoinColumn({ name: 'committee_uuid', referencedColumnName: 'uuid' })
  committee: ActivityCommitteeEntity;

  @Index()
  @Column({ type: 'char', length: 36 })
  member_uuid: string;

  @ManyToOne(() => MemberEntity, { nullable: false, createForeignKeyConstraints: false })
  @JoinColumn({ name: 'member_uuid', referencedColumnName: 'uuid' })
  member: MemberEntity;

  @Column({
    type: 'enum',
    enum: CommitteeMemberRole,
    default: CommitteeMemberRole.MEMBRE,
  })
  role: CommitteeMemberRole;

  @Column({ type: 'varchar', length: 100, nullable: true })
  commission: string | null;

  @Column({ type: 'char', length: 36 })
  admin_uuid: string;
}
