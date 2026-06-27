import { DateTimeEntity } from 'src/shared/entities/date-time.entity';
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
import { JournalEditionEntity } from './journal-edition.entity';

/**
 * Réception INDIVIDUELLE d'un membre pour une édition (1 ligne par membre reçu).
 * `received_at` non nul = le membre a reçu son exemplaire. `district_uuid` est
 * dénormalisé pour les agrégats (déduit du chemin de structure du membre).
 */
@Entity({ name: 'journal_member_receptions' })
@Unique('uq_journal_member_reception', ['edition_uuid', 'member_uuid'])
export class JournalMemberReceptionEntity extends DateTimeEntity {
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
  edition_uuid: string;

  @ManyToOne(() => JournalEditionEntity, {
    nullable: false,
    createForeignKeyConstraints: false,
  })
  @JoinColumn({ name: 'edition_uuid', referencedColumnName: 'uuid' })
  edition: JournalEditionEntity;

  /** Membre abonné (latin1 côté members ; pas de FK → insensible aux collations). */
  @Index()
  @Column({ type: 'char', length: 36 })
  member_uuid: string;

  /** District de rattachement (dénormalisé pour les statistiques). */
  @Index()
  @Column({ type: 'char', length: 36, nullable: true })
  district_uuid: string | null;

  @Column({ type: 'datetime', nullable: true })
  received_at: Date | null;

  @Column({ type: 'char', length: 36 })
  admin_uuid: string;
}
