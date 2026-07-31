import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsNotEmpty, IsOptional, IsUUID } from 'class-validator';

/**
 * Reversement d'un élément de référentiel vers un autre (Formations, Métiers, Localités).
 * Cf. `ReferentialMergeService`.
 */
export class MergeReferentialDto {
  /**
   * ⚠️ `@IsUUID()` **sans version**. Ces référentiels sont peuplés par MySQL (`default: (UUID())`),
   * qui produit des uuid **v1** : `a0113f68-672f-11f1-…` (le `1` de `11f1` est la version).
   * Exiger la v4 - le réflexe habituel - refusait tous les éléments existants avec un
   * « élément de départ invalide » incompréhensible. Le projet mélange les deux versions :
   * v1 côté base, v4 côté `uuidv4()` de l'entité `User`.
   */
  @ApiProperty({
    description: "Élément à vider (ses membres seront déplacés)",
    example: 'a0113f68-672f-11f1-9edd-00090ffe0001',
  })
  @IsUUID(undefined, { message: "L'élément de départ est invalide" })
  @IsNotEmpty({ message: "L'élément de départ est requis" })
  source_uuid: string;

  @ApiProperty({
    description: "Élément d'arrivée",
    example: '056a5b99-672f-11f1-9edd-00090ffe0001',
  })
  @IsUUID(undefined, { message: "L'élément d'arrivée est invalide" })
  @IsNotEmpty({ message: "L'élément d'arrivée est requis" })
  target_uuid: string;

  @ApiPropertyOptional({
    description:
      "Supprimer l'élément de départ une fois vidé (suppression logique, comme le bouton Supprimer de l'écran).",
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  delete_source?: boolean;
}
