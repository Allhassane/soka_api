import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateJournalDestinationDto {
  @ApiProperty({ description: 'UUID de la zone parente' })
  @IsUUID()
  @IsNotEmpty({ message: 'La zone est requise' })
  zone_uuid: string;

  @ApiProperty({
    description: 'Nom du centre / chapitre',
    example: 'GRANDE MONTAGNE',
  })
  @IsString()
  @IsNotEmpty({ message: 'Le nom de la destination est requis' })
  @MaxLength(191)
  name: string;

  @ApiPropertyOptional({ description: 'Ville', example: 'YOPOUGON' })
  @IsOptional()
  @IsString()
  @MaxLength(191)
  ville?: string;

  @ApiPropertyOptional({ description: 'Quartier', example: 'TOIT ROUGE' })
  @IsOptional()
  @IsString()
  @MaxLength(191)
  quartier?: string;

  @ApiPropertyOptional({
    description: 'UUID du membre correspondant chargé de la distribution',
  })
  @IsOptional()
  @IsUUID()
  correspondent_member_uuid?: string;

  @ApiPropertyOptional({
    description: 'Téléphone du correspondant (surcharge éventuelle)',
    example: '0707697733',
  })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  correspondent_phone?: string;

  @ApiPropertyOptional({
    description: 'Téléphone WhatsApp du correspondant',
    example: '0707697733',
  })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  correspondent_phone_whatsapp?: string;

  @ApiPropertyOptional({ description: 'Nouveaux ID enregistrés', example: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  nvx_id?: number;

  @ApiPropertyOptional({ description: 'Abonnés 12 mois', example: 156 })
  @IsOptional()
  @IsInt()
  @Min(0)
  abonnes_12_mois?: number;

  @ApiPropertyOptional({ description: 'Total abonnés', example: 156 })
  @IsOptional()
  @IsInt()
  @Min(0)
  total_abonnes?: number;
}
