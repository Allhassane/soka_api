import { Entity, PrimaryGeneratedColumn, Column, OneToMany } from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { DateTimeEntity } from 'src/shared/entities/date-time.entity';

@Entity('levels')
export class Level extends DateTimeEntity {
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
    description: 'Nom du niveau (ex: Première, Terminale)',
    example: 'Première',
  })
  @Column({ length: 255 })
  name: string;

  @ApiProperty({ description: 'Ordre d’affichage du niveau', example: 1 })
  @Column({ type: 'int' })
  order: number;

  @ApiProperty({
    description: 'Slug généré automatiquement à partir du nom',
    example: 'premiere',
  })
  @Column({ unique: true })
  slug: string;

  @Column({ type: 'varchar', length: 50, default: 'geographic' })
  category: 'geographic' | 'pedagogic';

  @ApiProperty({
    description: 'UUID de l’administrateur propriétaire',
    format: 'uuid',
  })
  @Column({ type: 'uuid' })
  admin_uuid: string;

  @ApiProperty({
    description: 'Statut du niveau',
    example: 'ACTIF',
    default: 'ACTIF',
  })
  @Column({ type: 'varchar', length: 50, default: 'enable' })
  status: 'enable' | 'disable' | 'delete';

  /** Relations **/

}
