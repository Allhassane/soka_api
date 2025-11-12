import { DepartmentEntity } from 'src/departments/entities/department.entity';
import { DateTimeEntity } from 'src/shared/entities/date-time.entity';
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  BeforeInsert,
  BeforeUpdate,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { v4 as uuidv4 } from 'uuid';

function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036F]/g, '') // Supprime les accents
    .replace(/[^a-z0-9]+/g, '-') // Remplace espaces et caractères spéciaux
    .replace(/(^-|-$)+/g, ''); // Supprime les tirets en début/fin
}

@Entity({ name: 'divisions' })
export class DivisionEntity extends DateTimeEntity {
  @PrimaryGeneratedColumn()
  id: number;

  /** UUID global de la division */
  @Column({ type: 'char', length: 36, unique: true })
  uuid: string;

  /** Nom de la division */
  @Column({ type: 'varchar', length: 191 })
  name: string;

  /** Slug auto-généré à partir du nom */
  @Column({ type: 'varchar', length: 191, unique: true })
  slug: string;

  /** Description optionnelle */
  @Column({ type: 'text', nullable: true })
  description?: string;

  /** Identifiant UUID du département parent */
  @Column({  type: 'char', length: 36, nullable: true })
  department_uuid?: string;

  /** Identifiant numérique du département parent */
  @Column({ type: 'int', nullable: true })
  department_id?: number;

  /** Relation avec le département parent */
  @ManyToOne(() => DepartmentEntity, (dep) => dep.divisions, {
    onDelete: 'SET NULL',
    eager: false,
  })
  @JoinColumn([
   // { name: 'department_uuid', referencedColumnName: 'uuid' },
    { name: 'department_id', referencedColumnName: 'id' },
  ])
  department?: DepartmentEntity;

  @Column({ type: 'varchar', length: 10, default: 'mixte' })
  gender: string;

  /** UUID de l'administrateur ayant créé la division */
  @Column({ type: 'uuid', nullable: false })
  admin_uuid: string;

  /** Statut global (enable, disable, deleted, etc.) */
  @Column({ type: 'varchar', length: 20, default: 'enable' })
  status: string;

  /** UUID automatique avant insertion */
  @BeforeInsert()
  generateUUID() {
    if (!this.uuid) this.uuid = uuidv4();
  }

  /** Génération automatique du slug avant insert/update */
  @BeforeInsert()
  @BeforeUpdate()
  generateSlug() {
    if (this.name) this.slug = slugify(this.name);
  }
}
