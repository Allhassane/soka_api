import { DateTimeEntity } from 'src/shared/entities/date-time.entity';
import { GlobalStatus } from 'src/shared/enums/global-status.enum';
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
import { JournalZoneEntity } from './journal-zone.entity';

/**
 * Destination = centre / chapitre / quartier qui reçoit le journal.
 * Lié à une zone et à un correspondant (membre) qui prend en charge
 * la distribution sur place.
 */
@Entity({ name: 'journal_destinations' })
export class JournalDestinationEntity extends DateTimeEntity {
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
  zone_uuid: string;

  @ManyToOne(() => JournalZoneEntity, (z) => z.destinations, { nullable: false })
  @JoinColumn({ name: 'zone_uuid', referencedColumnName: 'uuid' })
  zone: JournalZoneEntity;

  /** Nom du centre / chapitre */
  @Column({ type: 'varchar', length: 191 })
  name: string;

  /** Ville / quartier (ex : YOPOUGON-TOIT ROUGE) */
  @Column({ type: 'varchar', length: 191, nullable: true })
  ville: string;

  @Column({ type: 'varchar', length: 191, nullable: true })
  quartier: string;

  /** Correspondant chargé de la distribution */
  @Column({ type: 'char', length: 36, nullable: true })
  correspondent_member_uuid: string | null;

  @ManyToOne(() => MemberEntity, { nullable: true, createForeignKeyConstraints: false })
  @JoinColumn({ name: 'correspondent_member_uuid', referencedColumnName: 'uuid' })
  correspondent: MemberEntity | null;

  /** Téléphones (peuvent surcharger ceux du membre si différents) */
  @Column({ type: 'varchar', length: 30, nullable: true })
  correspondent_phone: string;

  @Column({ type: 'varchar', length: 30, nullable: true })
  correspondent_phone_whatsapp: string;

  /** Quantités prévisionnelles d'abonnés (recensement courant) */
  @Column({ type: 'int', default: 0 })
  nvx_id: number;

  @Column({ type: 'int', default: 0 })
  abonnes_12_mois: number;

  @Column({ type: 'int', default: 0 })
  total_abonnes: number;

  @Column({ type: 'longtext', nullable: true })
  history: string;

  @Column({ type: 'char', length: 36 })
  admin_uuid: string;

  @Column({ type: 'enum', enum: GlobalStatus, default: GlobalStatus.CREATED })
  status: string;
}
