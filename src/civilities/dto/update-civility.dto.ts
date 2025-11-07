import { IsOptional, IsString, MaxLength, IsEnum } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateMaritalStatusDto {
  @ApiPropertyOptional({
    description: 'Libellé ',
    example: 'Madame',
  })
  @IsString()
  @IsOptional()
  @MaxLength(150)
  name?: string;

  @ApiPropertyOptional({
    description: 'Sigle',
    example: 'Mme',
  })
  @IsString()
  @IsOptional()
  @MaxLength(91)
  sigle?: string;

  @ApiPropertyOptional({
    description: 'Description',
    example: 'Madame',
  })
  @IsString()
  @IsOptional()
  @MaxLength(255)
  description?: string;

  @ApiPropertyOptional({
    description: 'Statut',
     example: 'enable',
  })
  @IsString()
  @IsOptional()
  statut?: 'enable';
}
