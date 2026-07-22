import { IsOptional, IsString, ValidateIf, Length } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class AssignResponsibleDto {
  @ApiPropertyOptional({
    description:
      "UUID du membre désigné responsable. Envoyer null pour retirer le responsable.",
    example: 'a1b2c3d4-...',
    nullable: true,
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @Length(36, 36)
  member_uuid?: string | null;
}
