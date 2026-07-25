import { DateTimeEntity } from 'src/shared/entities/date-time.entity';
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToMany,
  BeforeInsert,
} from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { MemberTransferItemEntity } from './member-transfer-item.entity';

/** Sens de la demande. Seul `SORTANT` est exposé en v1 (cf. docs/TRANSFERT-MEMBRES.md §3). */
export enum TransferDirection {
  /** La source initie, la cible approuve. */
  SORTANT = 'SORTANT',
  /** La cible initie (« j'accueille ce membre »), la source approuve. Réservé v2. */
  ENTRANT = 'ENTRANT',
}

export enum TransferStatus {
  EN_ATTENTE = 'EN_ATTENTE',
  APPROUVEE = 'APPROUVEE',
  REFUSEE = 'REFUSEE',
  ANNULEE = 'ANNULEE',
  /** Le membre a changé de structure entre la demande et la décision (règle R5). */
  OBSOLETE = 'OBSOLETE',
}

export enum TransferMotif {
  DEMENAGEMENT = 'demenagement',
  AUTRE = 'autre',
}

/**
 * Demande de transfert d'un ou plusieurs membres d'un district vers un autre.
 *
 * Le **district est le pivot** : un déplacement à l'intérieur d'un même district reste une
 * édition simple, sans workflow (règle R1). Spécification : `docs/TRANSFERT-MEMBRES.md`.
 */
@Entity({ name: 'member_transfers' })
export class MemberTransferEntity extends DateTimeEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'char', length: 36, unique: true })
  uuid: string;

  /**
   * L'uuid est généré ici, pas par la base : `DEFAULT (UUID())` bloque le binlog STATEMENT
   * sur cette base. Même pattern que `MemberEntity.ensureUuid()`.
   */
  @BeforeInsert()
  ensureUuid() {
    this.uuid = this.uuid ?? uuidv4();
  }

  @Column({
    type: 'enum',
    enum: TransferDirection,
    default: TransferDirection.SORTANT,
  })
  direction: TransferDirection;

  @Column({
    type: 'enum',
    enum: TransferStatus,
    default: TransferStatus.EN_ATTENTE,
  })
  status: TransferStatus;

  /** District d'origine, résolu à la création en remontant la structure des membres. */
  @Column({ type: 'char', length: 36 })
  source_district_uuid: string;

  /** District d'accueil, choisi par l'initiateur. La feuille exacte est choisie à l'approbation. */
  @Column({ type: 'char', length: 36 })
  target_district_uuid: string;

  @Column({ type: 'varchar', length: 50, default: TransferMotif.DEMENAGEMENT })
  motif: string;

  @Column({ type: 'text', nullable: true })
  comment?: string | null;

  @Column({ type: 'char', length: 36 })
  initiated_by_user_uuid: string;

  @Column({ type: 'datetime', precision: 6, default: () => 'CURRENT_TIMESTAMP(6)' })
  initiated_at: Date;

  @Column({ type: 'char', length: 36, nullable: true })
  decided_by_user_uuid?: string | null;

  @Column({ type: 'datetime', precision: 6, nullable: true })
  decided_at?: Date | null;

  /** Obligatoire en cas de refus (règle R6). */
  @Column({ type: 'text', nullable: true })
  decision_comment?: string | null;

  @Column({ type: 'char', length: 36, nullable: true })
  admin_uuid?: string | null;

  @OneToMany(() => MemberTransferItemEntity, (item) => item.transfer)
  items: MemberTransferItemEntity[];
}
