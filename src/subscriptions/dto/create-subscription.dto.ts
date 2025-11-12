import { IsNotEmpty, IsOptional, IsString, MaxLength, IsEnum, IsNumber, IsDate, IsInt } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class CreateSubscriptionDto {
  @ApiProperty({
    description: 'Libellé de l’abonnement',
    example: 'Abonnement brochure 2025',
  })
  @IsString()
  @IsNotEmpty({ message: 'Le libellé est requis' })
  @MaxLength(191)
  name: string;

  @ApiProperty({
    description: 'Montant de l’abonnement',
    example: 1000,
  })
  @IsNotEmpty({ message: 'Le montant est requis' })
  @IsNumber({}, { message: 'Le montant doit être un nombre' })
  amount: number;

  @ApiProperty({
    description: "Année de l'abonnement",
    example: 2025,
  })
  @IsInt({ message: "L'année doit être un entier (ex: 2025)" })
  @IsNotEmpty({ message: "L'année de la campagne d'abonnement est requise" })
  year: number;

  @ApiProperty({
    description: "Date de début de l'abonnement",
    example: '2025-06-01',
  })
  @Type(() => Date)
  @IsDate({ message: 'La date de début doit être une date valide' })
  @IsNotEmpty({ message: 'La date de début est requise' })
  starts_at: Date;

  @ApiProperty({
    description: 'Date de fin de la campagne',
    example: '2025-12-31',
  })
  @Type(() => Date)
  @IsDate({ message: 'La date de fin doit être une date valide' })
  @IsNotEmpty({ message: 'La date de fin est requise' })
  stops_at: Date;

  @ApiPropertyOptional({
    description: 'Statut de la campagne',
    example: 'started',
  })
  @IsString()
  @IsOptional()
  status?: 'started' | 'stopped';
}
