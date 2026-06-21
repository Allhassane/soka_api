import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  BeforeInsert,
  Index,
} from 'typeorm';
import { v4 as uuidv4 } from 'uuid';

/**
 * Ligne d'échec d'import persistée. Dédoublonnée par `dedup_key` (matricule, sinon
 * `tel:<téléphone>`, sinon `nom:<nom prénom>`) : un réimport en échec met à jour la
 * ligne existante (pas de doublon) ; une réussite la supprime.
 */
@Entity({ name: 'import_failures' })
export class ImportFailureEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'char', length: 36, unique: true })
  uuid: string;

  @BeforeInsert()
  ensureUuid() {
    if (!this.uuid) this.uuid = uuidv4();
  }

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 191 })
  dedup_key: string;

  /**
   * Dernier « fichier chargé » (import_batches.uuid) ayant signalé cet échec. Le dédoublonnage
   * restant global, un membre en échec dans plusieurs fichiers est rattaché au plus récent.
   * NULL = échec antérieur au suivi par fichier.
   */
  @Index()
  @Column({ type: 'varchar', length: 36, nullable: true })
  batch_uuid: string | null;

  @Column({ type: 'int', nullable: true })
  line_number: number | null;

  @Column({ type: 'varchar', length: 191, nullable: true })
  fullname: string | null;

  @Column({ type: 'text', nullable: true })
  reason: string | null;

  @Column({ type: 'json', nullable: true })
  raw_data: Record<string, string> | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  admin_uuid: string | null;

  @CreateDateColumn({ type: 'datetime', precision: 6 })
  created_at: Date;

  @UpdateDateColumn({ type: 'datetime', precision: 6 })
  updated_at: Date;
}
