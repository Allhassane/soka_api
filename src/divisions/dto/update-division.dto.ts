import { IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateDivisionDto {
  @ApiPropertyOptional({
    description: 'Nom de la division',
    example: 'Administration',
  })
  @IsString()
  @IsOptional()
  @MaxLength(150)
  name?: string;

  @ApiPropertyOptional({
    description: 'Description de la division',
    example: 'division pour gérer les utilisateurs',
  })
  @IsString()
  @IsOptional()
  @MaxLength(255)
  description?: string;

  @ApiPropertyOptional({
    description: 'Statut de la division',
    example: 'enable',
  })
  @IsString()
  @IsOptional()
  status?: 'enable';
}
