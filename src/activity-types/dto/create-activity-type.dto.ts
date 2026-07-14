import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { ActivityTypeFamily, ActivityTypeSubcategory } from '../entities/activity-type.entity';

export class CreateActivityTypeDto {
  @ApiPropertyOptional({ description: "Libellé (auto-dérivé de la sous-catégorie si absent)" })
  @IsOptional()
  @IsString()
  @MaxLength(191)
  name?: string;

  @ApiPropertyOptional({ description: 'Description' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({
    enum: ActivityTypeFamily,
    description: "Famille : 'traditionnelle' ou 'sporadique'",
  })
  @IsEnum(ActivityTypeFamily)
  family: ActivityTypeFamily;

  @ApiProperty({
    enum: ActivityTypeSubcategory,
    description:
      "Sous-catégorie : mensuelle_departement | grande_commemoration | zandakai | sporadique_nationale | sporadique_locale",
  })
  @IsEnum(ActivityTypeSubcategory)
  subcategory: ActivityTypeSubcategory;

  @ApiPropertyOptional({
    description: 'Ce type implique-t-il des quotas par structure ?',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  requires_quota?: boolean;

  @ApiPropertyOptional({
    description: 'Ce type nécessite-t-il un comité d\'organisation ?',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  requires_committee?: boolean;

  @ApiPropertyOptional({
    description:
      "Règle de récurrence par défaut (ex : 'weekly:sunday', 'monthly:3rd-sunday')",
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  default_recurrence_rule?: string;

  @ApiPropertyOptional({ description: "Statut : 'enable' ou 'disable'", default: 'enable' })
  @IsOptional()
  @IsString()
  @MaxLength(36)
  status?: string;
}
