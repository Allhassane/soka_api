import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateActivityCommitteeDto {
  @ApiProperty({ description: "Nom du comité d'organisation" })
  @IsString()
  @MaxLength(191)
  name: string;

  @ApiPropertyOptional({ description: 'Description du comité' })
  @IsOptional()
  @IsString()
  description?: string;
}

export class UpdateActivityCommitteeDto {
  @ApiPropertyOptional({ description: "Nom du comité d'organisation" })
  @IsOptional()
  @IsString()
  @MaxLength(191)
  name?: string;

  @ApiPropertyOptional({ description: 'Description du comité' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: 'Statut du comité' })
  @IsOptional()
  @IsString()
  status?: string;
}
