import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class ValidateDistrictLotDto {
  @ApiPropertyOptional({
    description: 'true = réceptionné, false = annuler la réception',
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  received?: boolean;

  @ApiPropertyOptional({ description: 'Note libre sur la réception du lot' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;
}

export class ValidateMemberReceptionDto {
  @ApiPropertyOptional({
    description: 'true = membre a reçu, false = annuler',
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  received?: boolean;

  @ApiPropertyOptional({
    description: 'District de rattachement (sinon dérivé côté serveur)',
  })
  @IsOptional()
  @IsString()
  district_uuid?: string;
}
