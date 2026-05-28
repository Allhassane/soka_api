import { DateTimeEntity } from 'src/shared/entities/date-time.entity';
import { GlobalStatus } from 'src/shared/enums/global-status.enum';
import { StructureEntity } from 'src/structure/entities/structure.entity';
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
import { JournalDestinationEntity } from './journal-destination.entity';

/**
 * Zone de distribution du journal.
 * Une zone regroupe N destinations (centres / chapitres).
 * Ex (fichier Avril 2026) : ZONE 1, ZONE 2, ...
 */
@Entity({ name: 'journal_zones' })
export class JournalZoneEntity extends DateTimeEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'char', length: 36, unique: true })
  uuid: string;

  @BeforeInsert()
  ensureUuid() {
    this.uuid = this.uuid ?? uuidv4();
  }

  @Index()
  @Column({ type: 'int' })
  number: number;

  @Column({ type: 'varchar', length: 191 })
  name: string;

  /** Structure organisationnelle éventuellement liée à la zone */
  @Column({ type: 'char', length: 36, nullable: true })
  structure_uuid: string | null;

  @ManyToOne(() => StructureEntity, { nullable: true, createForeignKeyConstraints: false })
  @JoinColumn({ name: 'structure_uuid', referencedColumnName: 'uuid' })
  structure: StructureEntity | null;

  @Column({ type: 'longtext', nullable: true })
  history: string;

  @Column({ type: 'char', length: 36 })
  admin_uuid: string;

  @Column({ type: 'enum', enum: GlobalStatus, default: GlobalStatus.CREATED })
  status: string;

  @OneToMany(() => JournalDestinationEntity, (d) => d.zone)
  destinations: JournalDestinationEntity[];
}
