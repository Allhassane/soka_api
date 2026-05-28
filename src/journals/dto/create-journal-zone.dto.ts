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
    description: 'UUID de la structure organisationnelle liée à la zone',
  })
  @IsOptional()
  @IsUUID()
  structure_uuid?: string;
}
