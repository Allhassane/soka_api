import { IsNotEmpty, IsOptional } from 'class-validator';
import { LevelEntity } from 'src/level/entities/level.entity';
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

function slugify(s: string) {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036F]/g, '') // accents
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '');
}

@Entity({ name: 'responsibilities' })
export class ResponsibilityEntity extends DateTimeEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'char', length: 36, unique: true, default: () => '(UUID())' })
  uuid: string;

  @Column()
  name: string;

  @Column({ unique: true })
  slug: string;

  @Column({ type: 'varchar', length: 36 })
  admin_uuid: string;

  @Column({ type: 'varchar', length: 36, default: 'enable' })
  status: string;

  @Column({ type: 'varchar', length: 10, default: 'mixte' })
  gender: string;

  @Column({ type: 'varchar', length: 36, nullable: true })
  @IsNotEmpty()
  level_uuid?: string;

  @ManyToOne(() => LevelEntity, (level) => level.id, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'level_id', referencedColumnName: 'id' })
  level?: LevelEntity;

  @BeforeInsert()
  @BeforeUpdate()
  generateSlug() {
    if (this.name) this.slug = slugify(this.name);
  }
}
