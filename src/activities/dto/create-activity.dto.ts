import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDate,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import {
  ActivityTargetGender,
  ActivityTargetScope,
} from '../entities/activity.entity';

class OrganigramMemberDto {
  @ApiPropertyOptional({ description: 'UUID du membre' })
  @IsOptional()
  @IsUUID()
  member_uuid?: string;

  @ApiPropertyOptional({ description: 'Nom du membre' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ description: 'Role libre' })
  @IsOptional()
  @IsString()
  role?: string;

  @ApiPropertyOptional({ description: 'Sujet pour intervenants' })
  @IsOptional()
  @IsString()
  topic?: string;
}

export class OrganigramDto {
  @ApiPropertyOptional({ type: OrganigramMemberDto, description: 'President de seance' })
  @IsOptional()
  @ValidateNested()
  @Type(() => OrganigramMemberDto)
  president?: OrganigramMemberDto;

  @ApiPropertyOptional({ type: [OrganigramMemberDto], description: 'Moderateurs' })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OrganigramMemberDto)
  moderators?: OrganigramMemberDto[];

  @ApiPropertyOptional({ type: [OrganigramMemberDto], description: 'Intervenants' })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OrganigramMemberDto)
  speakers?: OrganigramMemberDto[];

  @ApiPropertyOptional({ type: [OrganigramMemberDto], description: 'Equipe logistique' })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OrganigramMemberDto)
  logistics?: OrganigramMemberDto[];

  @ApiPropertyOptional({ type: [OrganigramMemberDto], description: 'Roles supplementaires' })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OrganigramMemberDto)
  extras?: OrganigramMemberDto[];
}

export class CreateActivityDto {
  @ApiProperty({ description: 'Libelle de activite' })
  @IsString()
  @IsNotEmpty({ message: 'Le libelle est requis' })
  @MaxLength(191)
  name: string;

  @ApiPropertyOptional({ description: 'Description' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: 'Type (texte libre, déprécié)' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  type?: string;

  @ApiPropertyOptional({ description: 'UUID du type d\'activité' })
  @IsOptional()
  @IsUUID()
  activity_type_uuid?: string;

  @ApiPropertyOptional({ description: 'Lieu' })
  @IsOptional()
  @IsString()
  @MaxLength(191)
  location?: string;

  @ApiProperty({ description: 'Date de debut', example: '2026-06-10T09:00:00.000Z' })
  @Type(() => Date)
  @IsDate({ message: 'Date de debut invalide' })
  @IsNotEmpty()
  starts_at: Date;

  @ApiProperty({ description: 'Date de fin', example: '2026-06-10T12:00:00.000Z' })
  @Type(() => Date)
  @IsDate({ message: 'Date de fin invalide' })
  @IsNotEmpty()
  ends_at: Date;

  @ApiPropertyOptional({ description: 'Capacité du lieu (nombre de places)', minimum: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  capacity?: number;

  @ApiPropertyOptional({ description: 'Activité récurrente', default: false })
  @IsOptional()
  @IsBoolean()
  is_recurring?: boolean;

  @ApiPropertyOptional({
    description: 'Règle de récurrence (ex: "weekly:sunday", "monthly:3rd-sunday", "monthly:custom")',
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  recurrence_rule?: string;

  @ApiPropertyOptional({
    type: OrganigramDto,
    description: 'Organigramme de activite',
  })
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => OrganigramDto)
  organigram?: OrganigramDto;

  @ApiPropertyOptional({ description: 'UUID structure organisatrice' })
  @IsOptional()
  @IsUUID()
  structure_uuid?: string;

  @ApiPropertyOptional({
    enum: ActivityTargetScope,
    description: 'Perimetre des cibles',
    default: ActivityTargetScope.ALL_MEMBERS,
  })
  @IsOptional()
  @IsEnum(ActivityTargetScope)
  target_scope?: ActivityTargetScope;

  @ApiPropertyOptional({
    type: [String],
    description: 'UUIDs des structures ciblees',
  })
  @IsOptional()
  @IsArray()
  @IsUUID('all', { each: true })
  target_structures?: string[];

  @ApiPropertyOptional({
    type: [String],
    description: 'UUIDs des niveaux hierarchiques cibles',
  })
  @IsOptional()
  @IsArray()
  @IsUUID('all', { each: true })
  target_levels?: string[];

  @ApiPropertyOptional({
    type: [String],
    description: 'UUIDs des responsabilites ciblees',
  })
  @IsOptional()
  @IsArray()
  @IsUUID('all', { each: true })
  target_responsibilities?: string[];

  @ApiPropertyOptional({
    type: [String],
    description: 'UUIDs des niveaux de responsabilite cibles',
  })
  @IsOptional()
  @IsArray()
  @IsUUID('all', { each: true })
  target_responsibility_levels?: string[];

  @ApiPropertyOptional({
    type: [String],
    description: 'UUIDs des départements ciblés (hommes, femmes, jeunesse, etc.)',
  })
  @IsOptional()
  @IsArray()
  @IsUUID('all', { each: true })
  target_departments?: string[];

  @ApiPropertyOptional({
    description: 'Inclure recursivement les sous-structures',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  include_descendants?: boolean;

  @ApiPropertyOptional({
    enum: ActivityTargetGender,
    description: 'Filtre genre optionnel',
  })
  @IsOptional()
  @IsEnum(ActivityTargetGender)
  target_gender?: ActivityTargetGender;
}
