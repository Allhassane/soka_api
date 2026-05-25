import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreatePermissionsDto {
  @ApiProperty({
    description: 'Uuid du module',
    example: 'module uuid',
  })
  @IsString()
  @IsNotEmpty({ message: 'Le moudle est requis' })
  module_uuid: string;


  @ApiProperty({
    description: 'Nom de la permission',
    example: 'Créer un utilisateur',
  })
  @IsString()
  @IsNotEmpty({ message: 'Le nom est requis' })
  @MaxLength(150)
  name: string;


  @ApiProperty({
    description: 'Description optionnelle',
    example: 'Permet de créer un nouvel utilisateur',
    required: false,
  })
  @IsString()
  @IsOptional()
  @MaxLength(255)
  description?: string;
}
