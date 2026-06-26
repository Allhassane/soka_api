import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateJournalZoneDto {
  @ApiProperty({ description: 'Numéro de la zone', example: 1 })
  @IsInt()
  @Min(1)
  @IsNotEmpty({ message: 'Le numéro de la zone est requis' })
  number: number;

  @ApiProperty({ description: 'Nom de la zone', example: 'ZONE 1 - YOPOUGON' })
  @IsString()
  @IsNotEmpty({ message: 'Le nom de la zone est requis' })
  @MaxLength(191)
  name: string;

  @ApiPropertyOptional({
    description: 'UUID de la structure organisationnelle (région) liée à la zone',
  })
  @IsOptional()
  @IsUUID()
  structure_uuid?: string;

  @ApiPropertyOptional({
    description: 'UUID du membre responsable de la zone (coordinateur de distribution)',
  })
  @IsOptional()
  @IsUUID()
  responsible_member_uuid?: string;

  @ApiPropertyOptional({ description: 'Téléphone du responsable de zone' })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  responsible_phone?: string;

  @ApiPropertyOptional({ description: 'Téléphone WhatsApp du responsable de zone' })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  responsible_phone_whatsapp?: string;

  @ApiPropertyOptional({
    description: 'UUIDs des villes (référentiel cities) couvertes par la zone',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsUUID('all', { each: true })
  city_uuids?: string[];
}
