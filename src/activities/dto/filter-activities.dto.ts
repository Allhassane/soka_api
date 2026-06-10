import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsDate,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import { GlobalStatus } from 'src/shared/enums/global-status.enum';

/**
 * Filtres riches pour le listing des activités.
 * Tous les champs sont optionnels et combinables (AND).
 */
export class FilterActivitiesDto {
  @ApiPropertyOptional({ description: 'Recherche dans le nom ou la description' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ description: 'Type d’activité' })
  @IsOptional()
  @IsString()
  type?: string;

  @ApiPropertyOptional({ enum: GlobalStatus })
  @IsOptional()
  @IsEnum(GlobalStatus)
  status?: GlobalStatus;

  @ApiPropertyOptional({ description: 'UUID structure organisatrice' })
  @IsOptional()
  @IsUUID()
  structure_uuid?: string;

  @ApiPropertyOptional({
    description:
      'Restreint aux activités dont la structure organisatrice est de ce niveau',
  })
  @IsOptional()
  @IsUUID()
  level_uuid?: string;

  @ApiPropertyOptional({ description: 'UUIDs des structures (liste)', type: [String] })
  @IsOptional()
  @IsArray()
  @IsUUID('all', { each: true })
  structures?: string[];

  @ApiPropertyOptional({
    description: 'Activités impliquant ce membre (participant ou organigramme)',
  })
  @IsOptional()
  @IsUUID()
  member_uuid?: string;

  @ApiPropertyOptional({
    description: 'Date de début (filtre starts_at >=)',
    example: '2026-01-01',
  })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  from?: Date;

  @ApiPropertyOptional({
    description: 'Date de fin (filtre starts_at <=)',
    example: '2026-12-31',
  })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  to?: Date;

  @ApiPropertyOptional({
    description: 'À venir uniquement (starts_at > now)',
    type: Boolean,
  })
  @IsOptional()
  upcoming?: boolean | string;

  @ApiPropertyOptional({
    description: 'Passées uniquement (ends_at < now)',
    type: Boolean,
  })
  @IsOptional()
  past?: boolean | string;

  @ApiPropertyOptional({ description: 'Limite (1-200)', default: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;

  @ApiPropertyOptional({ description: 'Offset', default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;

  @ApiPropertyOptional({
    description: 'Tri : starts_at|created_at|name',
    default: 'starts_at',
  })
  @IsOptional()
  @IsString()
  order_by?: 'starts_at' | 'created_at' | 'name';

  @ApiPropertyOptional({ description: 'ASC|DESC', default: 'DESC' })
  @IsOptional()
  @IsString()
  order_dir?: 'ASC' | 'DESC';
}
