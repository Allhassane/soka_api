import { IsOptional, IsString, MaxLength, IsEnum } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateDepartmentDto {
  @ApiPropertyOptional({
    description: 'Nom du departement',
    example: 'Administration',
  })
  @IsString()
  @IsOptional()
  @MaxLength(150)
  name?: string;

  @ApiPropertyOptional({
    description: 'Genre du departement',
    example: 'mixte',
  })
  @IsString()
  @IsOptional()
  @IsEnum(['mixte', 'homme', 'femme'], {
    message: 'Le genre doit être mixte, homme ou femme',
  })
  gender?: 'homme';

  @ApiPropertyOptional({
    description: 'Description du departement',
    example: 'Departement le pour gérer les utilisateurs',
  })
  @IsString()
  @IsOptional()
  @MaxLength(255)
  description?: string;

  @ApiPropertyOptional({
    description: 'Statut de la departement',
     example: 'enable',
  })
  @IsString()
  @IsOptional()
  status?: 'enable';
}
