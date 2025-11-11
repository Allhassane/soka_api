import { IsNotEmpty, IsOptional, IsString, MaxLength, IsEnum, IsNumber, IsDate } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateSubscriptionDto {
  @ApiProperty({
    description: 'libellé',
    example: 'Abonnement brochure 2025',
  })
  @IsString()
  @IsNotEmpty({ message: 'le libellé est requis' })
  @MaxLength(191)
  name: string;

  @ApiProperty({
    example: '1000',
    required: true,
  })
  @IsNotEmpty()
  @IsNumber()
  amount: number;
  
  @ApiProperty({
    description: "Année de l'abonnement",
    example: '2025',
  })
  @IsNumber()
  @IsNotEmpty({ message: "l'année de la campagne d'abonnement est requis" })
  year: number;

  
  @ApiProperty({
    description: "Date de début de l'abonnement",
    example: '2025-06-01',
  })
  @IsDate()
  @IsNotEmpty({ message: "la date de début est requis" })
  starts_at: Date;

  @ApiProperty({
    description: 'Date de fin de la campagne',
    example: '2025-12-31',
  })
  @IsNumber()
  @IsNotEmpty({ message: "la date de fin est requis" })
  @MaxLength(4)
  stops_at: Date;

  @ApiPropertyOptional({
    description: 'Statut',
     example: 'enable',
  })
  @IsString()
  @IsOptional()
  status?: 'enable';
}
