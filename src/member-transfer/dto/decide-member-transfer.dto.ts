import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsNotEmpty,
  IsOptional,
  IsString,
  MinLength,
  ValidateNested,
} from 'class-validator';

/** Placement d'un membre dans une structure d'accueil précise (groupe / sous-groupe). */
export class TransferPlacementDto {
  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  member_uuid: string;

  @ApiProperty({
    description:
      "Structure d'accueil : doit être de niveau GROUPE ou SOUS_GROUPE et appartenir au district cible",
  })
  @IsNotEmpty()
  @IsString()
  structure_uuid: string;
}

/**
 * Approbation : l'approbateur fixe la structure d'accueil de chaque membre.
 * La décision est **globale** (tous les membres ou aucun) — cf. `docs/TRANSFERT-MEMBRES.md` §3.
 */
export class ApproveMemberTransferDto {
  @ApiProperty({ type: [TransferPlacementDto] })
  @IsArray()
  @ArrayNotEmpty({ message: "Indiquez la structure d'accueil de chaque membre" })
  @ValidateNested({ each: true })
  @Type(() => TransferPlacementDto)
  placements: TransferPlacementDto[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  comment?: string;
}

/** Refus : motif obligatoire (règle R6). */
export class RejectMemberTransferDto {
  @ApiProperty({ description: 'Motif du refus — obligatoire' })
  @IsNotEmpty({ message: 'Le motif du refus est obligatoire' })
  @IsString()
  @MinLength(3, { message: 'Le motif du refus doit être explicite' })
  comment: string;
}
