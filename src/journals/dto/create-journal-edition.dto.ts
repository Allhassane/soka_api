import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDate,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateJournalEditionDto {
  @ApiProperty({ description: 'Numéro de l’édition', example: 68 })
  @IsInt()
  @Min(1)
  @IsNotEmpty({ message: 'Le numéro de l’édition est requis' })
  number: number;

  @ApiProperty({
    description: 'Titre du journal',
    example: 'Le Serment du Bonheur',
  })
  @IsString()
  @IsNotEmpty({ message: 'Le titre est requis' })
  @MaxLength(191)
  title: string;

  @ApiProperty({ description: 'Mois (1-12)', example: 4 })
  @IsInt()
  @Min(1)
  @Max(12)
  month: number;

  @ApiProperty({ description: 'Année', example: 2026 })
  @IsInt()
  @Min(2000)
  year: number;

  @ApiPropertyOptional({
    description: 'UUID de la campagne d’abonnement liée',
  })
  @IsOptional()
  @IsUUID()
  subscription_uuid?: string;

  @ApiProperty({
    description: 'Date de lancement de la distribution',
    example: '2026-04-01T08:00:00.000Z',
  })
  @Type(() => Date)
  @IsDate({ message: 'Date de lancement invalide' })
  @IsNotEmpty()
  distribution_start_at: Date;

  @ApiPropertyOptional({ description: 'Tirage total imprimé', example: 5000 })
  @IsOptional()
  @IsInt()
  @Min(0)
  total_printed?: number;

  @ApiPropertyOptional({
    description: 'URL de la photo de couverture',
    example: '/uploads/journals/cover.jpg',
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  cover_image?: string;

  @ApiPropertyOptional({
    description: 'URL de la version numérique (PDF)',
    example: '/uploads/journals/edition.pdf',
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  digital_file?: string;
}
