import { IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdatePermissionsDto {
  @ApiPropertyOptional({
    description: 'Nom de la permission',
    example: 'Modifier un utilisateur',
  })
  @IsString()
  @IsOptional()
  @MaxLength(150)
  name?: string;

  @ApiPropertyOptional({
    description: 'Description de la permission',
    example: 'Permet de modifier les informations d’un utilisateur',
  })
  @IsString()
  @IsOptional()
  @MaxLength(255)
  description?: string;
}
