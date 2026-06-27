// member-stats-filters.dto.ts
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';

export class MemberStatsFilters {
  @ApiPropertyOptional({
    description: 'UUID de la région',
    example: '550e8400-e29b-41d4-a716-446655440000'
  })
  @IsOptional()
  @IsUUID()
  region_uuid?: string;

  @ApiPropertyOptional({
    description: 'UUID du centre régional (palier entre région et centre)',
    example: '550e8400-e29b-41d4-a716-446655440000'
  })
  @IsOptional()
  @IsUUID()
  centre_regional_uuid?: string;

  @ApiPropertyOptional({
    description: 'UUID du centre',
    example: '550e8400-e29b-41d4-a716-446655440001'
  })
  @IsOptional()
  @IsUUID()
  centre_uuid?: string;

  @ApiPropertyOptional({
    description: 'UUID du chapitre',
    example: '550e8400-e29b-41d4-a716-446655440002'
  })
  @IsOptional()
  @IsUUID()
  chapitre_uuid?: string;

  @ApiPropertyOptional({
    description: 'UUID du district',
    example: '550e8400-e29b-41d4-a716-446655440003'
  })
  @IsOptional()
  @IsUUID()
  district_uuid?: string;

  @ApiPropertyOptional({
    description: 'UUID du groupe',
    example: '550e8400-e29b-41d4-a716-446655440004'
  })
  @IsOptional()
  @IsUUID()
  groupe_uuid?: string;

  @ApiPropertyOptional({
    description: 'UUID du sous-groupe (palier feuille)',
    example: '550e8400-e29b-41d4-a716-446655440000'
  })
  @IsOptional()
  @IsUUID()
  sous_groupe_uuid?: string;

  @ApiPropertyOptional({
    description: 'UUID du département',
    example: '550e8400-e29b-41d4-a716-446655440005'
  })
  @IsOptional()
  @IsUUID()
  department_uuid?: string;

  @ApiPropertyOptional({
    description: 'UUID de la division',
    example: '550e8400-e29b-41d4-a716-446655440006'
  })
  @IsOptional()
  @IsUUID()
  division_uuid?: string;
}
