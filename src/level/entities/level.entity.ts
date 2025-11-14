import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { DateTimeEntity } from 'src/shared/entities/date-time.entity';

@Entity('levels')
export class LevelEntity extends DateTimeEntity {
  @ApiProperty({
    description: 'Identifiant interne auto-incrémenté',
    example: 1,
  })
  @PrimaryGeneratedColumn()
  id: number;

  @ApiProperty({
    description: 'UUID unique de l’enregistrement',
    format: 'uuid',
  })
  @Column({ type: 'uuid', unique: true })
  uuid: string;

  @ApiProperty({
    description: 'Nom du niveau',
    example: 'Première',
  })
  @Column({ length: 255 })
  name: string;

  @ApiProperty({ description: 'Ordre du niveau', example: 1 })
  @Column({ type: 'int' })
  order: number;

  @Column({ type: 'varchar', length: 50, default: 'mixte' })
  category: 'responsibility' | 'level';

  @ApiProperty({
    description: 'UUID de l’administrateur propriétaire',
    format: 'uuid',
  })
  @Column({ type: 'uuid', nullable: true })
  admin_uuid?: string;
}
