import { IsNotEmpty, IsOptional, IsString, MaxLength, IsEnum } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateDepartmentDto {
  @ApiProperty({
    description: 'UUID du département',
    example: '2fe9da24-88a3-4193-b37d-278885dff993',
  })
  @IsString()
  @IsOptional()
  @MaxLength(150)
  uuid?: string;

  @ApiProperty({
    description: 'Nom du département',
    example: 'Departement Homme',
  })
  @IsString()
  @IsNotEmpty({ message: 'Le nom du département est requis' })
  @MaxLength(150)
  name: string;

  @ApiPropertyOptional({
    description: 'Genre du département',
    example: 'mixte',
  })
  @IsString()
  @IsOptional()
  @IsEnum(['mixte', 'homme', 'femme'], {
    message: 'Le genre doit être mixte, homme ou femme',
  })
  gender?: 'mixte' | 'homme' | 'femme';

  @ApiPropertyOptional({
    description: 'Description du département',
    example: 'Département pour gérer les activités !',
  })
  @IsString()
  @IsOptional()
  @MaxLength(255)
  description?: string;

  @ApiPropertyOptional({
    description: 'Statut du département',
     example: 'enable',
  })
  @IsString()
  @IsOptional()
  status?: 'enable';
}
