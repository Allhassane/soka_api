import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { ActivityParticipantRole } from '../entities/activity-participant.entity';

export class GuestParticipantDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  lastname: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  firstname: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiProperty({ enum: ['homme', 'femme'] })
  @IsEnum(['homme', 'femme'])
  gender: 'homme' | 'femme';
}

export class AssignParticipantsDto {
  @ApiPropertyOptional({ type: [String], description: 'UUIDs des membres existants à assigner' })
  @IsOptional()
  @IsArray()
  @IsUUID('all', { each: true })
  member_uuids?: string[];

  @ApiPropertyOptional({ type: [GuestParticipantDto], description: 'Invités non-inscrits à créer' })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => GuestParticipantDto)
  guests?: GuestParticipantDto[];

  @ApiPropertyOptional({
    enum: ActivityParticipantRole,
    default: ActivityParticipantRole.PARTICIPANT,
  })
  @IsOptional()
  @IsEnum(ActivityParticipantRole)
  role?: ActivityParticipantRole;
}
