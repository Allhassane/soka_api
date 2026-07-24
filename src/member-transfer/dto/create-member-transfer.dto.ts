import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayNotEmpty,
  IsArray,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';
import { TransferMotif } from '../entities/member-transfer.entity';

/**
 * Création d'une demande de transfert.
 *
 * L'initiateur ne choisit que le **district** d'accueil : la structure finale
 * (groupe / sous-groupe) est choisie par l'approbateur, seul à connaître la répartition
 * interne de son district.
 */
export class CreateMemberTransferDto {
  @ApiProperty({
    description:
      'Membres à transférer. Ils doivent tous appartenir au MÊME district source.',
    type: [String],
  })
  @IsArray()
  @ArrayNotEmpty({ message: 'Sélectionnez au moins un membre à transférer' })
  @IsString({ each: true })
  member_uuids: string[];

  @ApiProperty({ description: "UUID de la structure de niveau DISTRICT d'accueil" })
  @IsNotEmpty({ message: 'Le district de destination est obligatoire' })
  @IsString()
  target_district_uuid: string;

  @ApiPropertyOptional({ enum: TransferMotif, default: TransferMotif.DEMENAGEMENT })
  @IsOptional()
  @IsIn(Object.values(TransferMotif))
  motif?: TransferMotif;

  @ApiPropertyOptional({ description: 'Précision libre sur le motif' })
  @IsOptional()
  @IsString()
  comment?: string;
}

/** Aperçu d'impact : même cible, sans créer la demande. */
export class ImpactPreviewDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  member_uuids: string[];

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  target_district_uuid: string;
}
