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
  Unique,
} from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { CommitteesEntity } from './committees.entity';

/**
 * Liaison membre <-> comité spécialisé (Digitalisation, Juridique, Dakko…).
 * Many-to-many : un membre peut appartenir à plusieurs comités. La contrainte
 * d'unicité empêche d'ajouter deux fois le même membre dans un même comité.
 */
@Entity({ name: 'committee_members' })
@Unique('uq_committee_member', ['committee_uuid', 'member_uuid'])
export class CommitteeMemberEntity extends DateTimeEntity {
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

  @ManyToOne(() => CommitteesEntity, (c) => c.members, {
    nullable: false,
    createForeignKeyConstraints: false,
  })
  @JoinColumn({ name: 'committee_uuid', referencedColumnName: 'uuid' })
  committee: CommitteesEntity;

  @Index()
  @Column({ type: 'char', length: 36 })
  member_uuid: string;

  @ManyToOne(() => MemberEntity, {
    nullable: false,
    createForeignKeyConstraints: false,
  })
  @JoinColumn({ name: 'member_uuid', referencedColumnName: 'uuid' })
  member: MemberEntity;

  /** UUID de l'utilisateur (responsable ou admin) qui a ajouté le membre. */
  @Column({ type: 'char', length: 36 })
  admin_uuid: string;
}
