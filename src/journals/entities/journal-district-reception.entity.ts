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
 * Réception du LOT d'un district pour une édition (1 ligne par district desservi).
 * Le district est une STRUCTURE (déduite du chemin de structure des abonnés payés).
 * Le validateur par défaut est le responsable enregistré du district (auto).
 * `received_at` non nul = lot réceptionné ; sinon en attente (ou en retard si la
 * date limite de distribution de l'édition est dépassée).
 */
@Entity({ name: 'journal_district_receptions' })
@Unique('uq_journal_district_reception', ['edition_uuid', 'district_uuid'])
export class JournalDistrictReceptionEntity extends DateTimeEntity {
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

  /** Structure du district (utf8mb4). Pas de FK : insensible aux collations. */
  @Index()
  @Column({ type: 'char', length: 36 })
  district_uuid: string;

  /** Snapshot du nom du district au moment de la validation. */
  @Column({ type: 'varchar', length: 255, nullable: true })
  district_name: string | null;

  /** Réceptionnaire (responsable du district par défaut, sinon validateur). */
  @Column({ type: 'char', length: 36, nullable: true })
  responsible_member_uuid: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  responsible_name: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  responsible_phone: string | null;

  /** Horodatage de réception du lot (null = pas encore réceptionné). */
  @Column({ type: 'datetime', nullable: true })
  received_at: Date | null;

  @Column({ type: 'text', nullable: true })
  note: string | null;

  @Column({ type: 'char', length: 36 })
  admin_uuid: string;
}
