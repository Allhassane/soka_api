import { IsOptional, IsString, MaxLength, IsEnum } from 'class-validator';
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
    description: 'Statut du comité',
     example: 'enable',
  })
  @IsString()
  @IsOptional()
  status?: 'enable';
}
