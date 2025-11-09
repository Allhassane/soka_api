import { IsNotEmpty, IsOptional, IsString, MaxLength, IsEnum } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateDepartmentDto {
  @ApiProperty({
    description: 'Nom du département',
    example: 'Departement Homme',
  })
  @IsString()
  @IsNotEmpty({ message: 'Le nom du département est requis' })
  @MaxLength(150)
  name: string;

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
