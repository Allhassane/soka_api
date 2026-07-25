import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  IsEnum,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateCommitteeDto {
  @ApiProperty({
    description: 'Nom du comité',
    example: 'Comité 1',
  })
  @IsString()
  @IsNotEmpty({ message: 'Le nom du comité est requise' })
  @MaxLength(150)
  name: string;

  @ApiPropertyOptional({
    description: 'Description du comité',
    example: 'Comité pour gérer les activités !',
  })
  @IsString()
  @IsOptional()
  @MaxLength(255)
  description?: string;

  @ApiProperty({
    description: 'UUID du rôle porté par le comité (obligatoire)',
    example: 'fcb82848-51de-466b-9e81-5de4be67b795',
    format: 'uuid',
  })
  @IsNotEmpty({ message: 'Le rôle du comité est requis' })
  @IsUUID('4', { message: "L'identifiant du rôle est invalide" })
  role_uuid: string;

  @ApiPropertyOptional({
    description: 'UUID du niveau porté par le comité (facultatif)',
    example: '4bc1e996-58d0-45ae-a987-87f48895261e',
    format: 'uuid',
    nullable: true,
  })
  // `@IsOptional()` laisse passer aussi bien l'absence du champ que `null` : le niveau est facultatif.
  @IsOptional()
  @IsUUID('4', { message: "L'identifiant du niveau est invalide" })
  level_uuid?: string | null;

  @ApiPropertyOptional({
    description: 'Statut du comité',
     example: 'enable',
  })
  @IsString()
  @IsOptional()
  status?: 'enable';
}
