import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

/**
 * Refus d'un dossier d'enregistrement.
 *
 * Le motif est **obligatoire** (règle R7) : le refus étant définitif, la personne qui a saisi
 * doit savoir quoi corriger avant de redéposer - sinon elle redépose à l'identique.
 */
export class RejectMemberRegistrationDto {
  @ApiProperty({
    description: 'Motif du refus, affiché au déposant. Obligatoire.',
    example: 'Date de naissance incohérente avec la pièce fournie.',
  })
  @IsString()
  @IsNotEmpty({ message: 'Le motif du refus est obligatoire.' })
  @MaxLength(2000)
  comment: string;
}
