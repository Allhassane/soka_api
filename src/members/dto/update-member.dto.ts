import { PartialType, ApiPropertyOptional } from '@nestjs/swagger';
import { CreateMemberDto } from './create-member.dto';
import { IsUUID, IsOptional } from 'class-validator';

/**
 * DTO de mise à jour d'un membre existant.
 * Étend le CreateMemberDto mais rend tous les champs optionnels.
 */
export class UpdateMemberDto extends PartialType(CreateMemberDto) {
  @ApiPropertyOptional({
    description: "UUID du membre à mettre à jour (utile pour les validations internes)",
  })
  @IsOptional()
  @IsUUID()
  uuid?: string;
}
