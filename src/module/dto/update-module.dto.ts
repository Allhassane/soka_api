import { IsOptional, IsString, MaxLength, IsEnum } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateModuleDto {
  @ApiPropertyOptional({
    description: 'Nom du module',
    example: 'Administration',
  })
  @IsString()
  @IsOptional()
  @MaxLength(150)
  name?: string;

  @ApiPropertyOptional({
    description: 'Description du module',
    example: 'Module pour gérer les utilisateurs et les permissions',
  })
  @IsString()
  @IsOptional()
  @MaxLength(255)
  description?: string;

  @ApiPropertyOptional({
    description: 'Statut du module',
    default: 'enable',
  })
  @IsString()
  @IsOptional()
  status?: 'enable';
}
