import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayNotEmpty,
  IsArray,
  IsEnum,
  IsOptional,
  IsUUID,
} from 'class-validator';
import { ActivityParticipantRole } from '../entities/activity-participant.entity';

export class AssignParticipantsDto {
  @ApiProperty({ type: [String], description: 'UUIDs des membres à assigner' })
  @IsArray()
  @ArrayNotEmpty()
  @IsUUID('all', { each: true })
  member_uuids: string[];

  @ApiPropertyOptional({
    enum: ActivityParticipantRole,
    default: ActivityParticipantRole.PARTICIPANT,
  })
  @IsOptional()
  @IsEnum(ActivityParticipantRole)
  role?: ActivityParticipantRole;
}
