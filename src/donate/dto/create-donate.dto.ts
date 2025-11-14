import { ApiProperty } from '@nestjs/swagger';
import {
  IsDate,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString
} from 'class-validator';
import { Type } from 'class-transformer';
import { DonateCategory } from 'src/shared/enums/donate.enum';

export class CreateDonateDto {
  @ApiProperty({
    example: 'Campagne de don pour la structure',
    required: true,
  })
  @IsString()
  @IsNotEmpty({ message: 'Le nom de la campagne est requis' })
  name: string;

  @ApiProperty({
    description: 'Date de début de la campagne',
    example: '2025-01-01',
  })
  @Type(() => Date)
  @IsDate({ message: 'La date de début doit être une date valide' })
  @IsNotEmpty({ message: 'La date de début est requise' })
  starts_at: Date;

  @ApiProperty({
    description: 'Date de fin de la campagne',
    example: '2025-06-01',
  })
  @Type(() => Date)
  @IsDate({ message: 'La date de fin doit être une date valide' })
  @IsNotEmpty({ message: 'La date de fin est requise' })
  stops_at: Date;

  @ApiProperty({
    example: 'fixed_amount',
    enum: DonateCategory,
    required: true,
    description: 'Type de campagne : montant fixe ou libre',
  })
  @IsEnum(DonateCategory, {
    message: 'La catégorie doit être "fixed_amount" ou "free_amount"'
  })
  @IsNotEmpty({ message: 'La catégorie est requise' })
  category: DonateCategory;

  @ApiProperty({
    example: 1000,
    required: false,
    description: 'Montant du don (obligatoire si catégorie = fixed_amount)',
  })
  @IsNumber({}, { message: 'Le montant doit être un nombre' })
  @IsOptional()
  amount?: number;
}
