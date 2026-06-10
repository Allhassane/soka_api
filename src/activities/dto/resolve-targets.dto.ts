import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsOptional,
  IsUUID,
} from 'class-validator';
import {
  ActivityTargetGender,
  ActivityTargetScope,
} from '../entities/activity.entity';

/**
 * Critères de ciblage. Tous optionnels — si vide, on prend ceux stockés sur
 * l'activité. Permet aussi de tester un ciblage ad hoc via /targets/preview
 * sans toucher à l'activité.
 */
export class ResolveTargetsDto {
  @ApiPropertyOptional({ enum: ActivityTargetScope })
  @IsOptional()
  @IsEnum(ActivityTargetScope)
  target_scope?: ActivityTargetScope;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsUUID('all', { each: true })
  target_structures?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsUUID('all', { each: true })
  target_levels?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsUUID('all', { each: true })
  target_responsibilities?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsUUID('all', { each: true })
  target_responsibility_levels?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  include_descendants?: boolean;

  @ApiPropertyOptional({ enum: ActivityTargetGender })
  @IsOptional()
  @IsEnum(ActivityTargetGender)
  target_gender?: ActivityTargetGender;
}
