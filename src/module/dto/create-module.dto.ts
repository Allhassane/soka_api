import { IsNotEmpty, IsOptional, IsString, MaxLength, IsEnum } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateModuleDto {
  @ApiProperty({
    description: 'Nom du module',
    example: 'Administration',
  })
  @IsString()
  @IsNotEmpty({ message: 'Le nom du module est requis' })
  @MaxLength(150)
  name: string;

  @ApiPropertyOptional({
    description: 'Description du module',
    example: 'Module pour gérer les utilisateurs et les permissions',
  })
  @IsString()
  @IsOptional()
  @MaxLength(255)
  description?: string;

  /* @ApiProperty({
    description: 'UUID de l’administrateur créant le module',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @IsString()
  @IsNotEmpty({ message: 'L’admin UUID est requis' })
  admin_uuid: string; */

  @ApiPropertyOptional({
    description: 'Statut du module',
    default: 'enable',
  })
  @IsString()
  @IsOptional()
  status?: 'enable';
}
