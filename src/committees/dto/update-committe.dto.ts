import {
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateIf,
  IsEnum,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateCommitteeDto {
  @ApiPropertyOptional({
    description: 'Nom du comité',
    example: 'Comité 2',
  })
  @IsString()
  @IsOptional()
  @MaxLength(150)
  name?: string;

  @ApiPropertyOptional({
    description: 'Description du comité',
    example: 'comité pour gérer les utilisateurs',
  })
  @IsString()
  @IsOptional()
  @MaxLength(255)
  description?: string;

  @ApiPropertyOptional({
    description:
      'UUID du rôle porté par le comité. Champ absent = inchangé ; il ne peut pas être retiré.',
    example: 'fcb82848-51de-466b-9e81-5de4be67b795',
    format: 'uuid',
  })
  // ⚠️ `@ValidateIf` et non `@IsOptional()` : ce dernier laisserait aussi passer `null`, or un
  // comité ne doit jamais se retrouver sans rôle une fois qu'il en porte un.
  @ValidateIf((_, value) => value !== undefined)
  @IsUUID('4', { message: "L'identifiant du rôle est invalide" })
  role_uuid?: string;

  @ApiPropertyOptional({
    description:
      'UUID du niveau porté par le comité. Champ absent = inchangé ; envoyer null pour le retirer.',
    example: '4bc1e996-58d0-45ae-a987-87f48895261e',
    format: 'uuid',
    nullable: true,
  })
  // `@IsOptional()` court-circuite la validation sur `undefined` **et** sur `null` : c'est ce qui
  // permet au front d'envoyer `level_uuid: null` pour détacher le niveau.
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
