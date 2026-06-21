import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  BeforeInsert,
} from 'typeorm';
import { v4 as uuidv4 } from 'uuid';

/**
 * Un « fichier chargé » : une ligne par commit d'import (cf. décision « regroupement par
 * chargement »). Les lignes en échec (`import_failures.batch_uuid`) pointent vers le DERNIER
 * batch qui les a signalées (le dédoublonnage des échecs reste global, cf. ImportFailureEntity).
 * Les compteurs sont un instantané au moment du commit ; le nombre d'erreurs ENCORE en suspens
 * est recompté en direct depuis `import_failures`.
 */
@Entity({ name: 'import_batches' })
export class ImportBatchEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'char', length: 36, unique: true })
  uuid: string;

  @BeforeInsert()
  ensureUuid() {
    if (!this.uuid) this.uuid = uuidv4();
  }

  /** Nom d'origine du fichier importé (Multer `originalname`). */
  @Column({ type: 'varchar', length: 255, nullable: true })
  file_name: string | null;

  @Column({ type: 'int', default: 0 })
  total_rows: number;

  @Column({ type: 'int', default: 0 })
  created_count: number;

  @Column({ type: 'int', default: 0 })
  updated_count: number;

  @Column({ type: 'int', default: 0 })
  failed_count: number;

  @Column({ type: 'varchar', length: 36, nullable: true })
  admin_uuid: string | null;

  @CreateDateColumn({ type: 'datetime', precision: 6 })
  created_at: Date;
}
