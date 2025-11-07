import { IsOptional, IsString, MaxLength, IsEnum } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateMaritalStatusDto {
  @ApiPropertyOptional({
    description: 'Libellé ',
    example: 'célibataire',
  })
  @IsString()
  @IsOptional()
  @MaxLength(150)
  name?: string;

  @ApiPropertyOptional({
    description: 'Statut de la situation matrimoniale',
     example: 'enable',
  })
  @IsString()
  @IsOptional()
  statut?: 'enable';
}
