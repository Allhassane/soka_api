import { MemberEntity } from 'src/members/entities/member.entity';
import { DateTimeEntity } from 'src/shared/entities/date-time.entity';
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  BeforeInsert,
} from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { MemberTransferEntity } from './member-transfer.entity';

/**
 * Un membre dans une demande de transfert.
 *
 * ⚠️ Cette table **est** l'historique de mobilité du membre : `from_structure_uuid` et
 * `to_structure_uuid` sont figés au moment de la demande / de l'application. Pas de table
 * d'audit séparée — l'information est déjà ici.
 *
 * Jointures sur les colonnes `*_uuid` (`referencedColumnName: 'uuid'`), comme partout dans le
 * domaine membre.
 */
@Entity({ name: 'member_transfer_items' })
export class MemberTransferItemEntity extends DateTimeEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'char', length: 36, unique: true })
  uuid: string;

  /** Voir `MemberTransferEntity.ensureUuid()` : pas de `DEFAULT (UUID())` sur cette base. */
  @BeforeInsert()
  ensureUuid() {
    this.uuid = this.uuid ?? uuidv4();
  }

  @Column({ type: 'char', length: 36 })
  transfer_uuid: string;

  @ManyToOne(() => MemberTransferEntity, (transfer) => transfer.items, {
    nullable: true,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'transfer_uuid', referencedColumnName: 'uuid' })
  transfer?: MemberTransferEntity;

  @Column({ type: 'char', length: 36 })
  member_uuid: string;

  @ManyToOne(() => MemberEntity, { nullable: true })
  @JoinColumn({ name: 'member_uuid', referencedColumnName: 'uuid' })
  member?: MemberEntity | null;

  /** Structure du membre au moment de la demande. Sert au contrôle anti-écrasement (R5). */
  @Column({ type: 'char', length: 36 })
  from_structure_uuid: string;

  /** Feuille d'accueil choisie par l'approbateur. NULL tant que la demande n'est pas approuvée. */
  @Column({ type: 'char', length: 36, nullable: true })
  to_structure_uuid?: string | null;

  /**
   * UUID des `responsibilities` dont la ligne `member_responsibilities` a été soft-deleted à
   * l'application, parce que leur ancre de niveau a changé (règle R8). Rend l'opération
   * auditable et réversible.
   */
  @Column({ type: 'json', nullable: true })
  lost_responsibility_uuids?: string[] | null;

  @Column({ type: 'datetime', precision: 6, nullable: true })
  applied_at?: Date | null;
}
