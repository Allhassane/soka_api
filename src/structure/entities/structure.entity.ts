import { IsOptional } from 'class-validator';
import { LevelEntity } from 'src/level/entities/level.entity';
import { DateTimeEntity } from 'src/shared/entities/date-time.entity';
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
} from 'typeorm';

@Entity({ name: 'structures' })
export class StructureEntity extends DateTimeEntity {
  @PrimaryGeneratedColumn()
  id: number;

  //@Column({ type: 'uuid', unique: true, default: () => 'gen_random_uuid()' }) // Postgres extension pgcrypto or use uuid-ossp
  @Column({ type: 'char', length: 36, unique: true, default: () => '(UUID())' })
  uuid: string;

  @Column({ nullable: false })
  name: string;

  @Column({ type: 'varchar', length: 36, nullable: true })
  @IsOptional()
  parent_uuid?: string;

  @ManyToOne(() => StructureEntity, (structure) => structure.parent, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'parent_id', referencedColumnName: 'id' })
  parent?: StructureEntity | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  @IsOptional()
  level_uuid?: string;

  @ManyToOne(() => LevelEntity, (level) => level.id, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'level_id', referencedColumnName: 'id' })
  level?: LevelEntity | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  @IsOptional()
  admin_uuid?: string;
}
