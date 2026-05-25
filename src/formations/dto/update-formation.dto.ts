import { IsOptional, IsString, MaxLength, IsEnum } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateFormationDto {
  @ApiPropertyOptional({
    description: 'Libellé ',
    example: 'Madame',
  })
  @IsString()
  @IsOptional()
  @MaxLength(150)
  name?: string;

  @ApiPropertyOptional({
    description: 'Statut',
     example: 'enable',
  })
  @IsString()
  @IsOptional()
  status?: 'enable';
}
