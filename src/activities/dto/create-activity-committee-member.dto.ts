import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { CommissionType, CommitteeMemberRole } from '../entities/activity-committee-member.entity';

export class CreateActivityCommitteeMemberDto {
  @ApiProperty({ description: 'UUID du membre' })
  @IsUUID()
  member_uuid: string;

  @ApiPropertyOptional({
    enum: CommitteeMemberRole,
    default: CommitteeMemberRole.MEMBRE,
    description: 'Rôle dans le comité',
  })
  @IsOptional()
  @IsEnum(CommitteeMemberRole)
  role?: CommitteeMemberRole;

  @ApiPropertyOptional({
    description: 'Commission à laquelle appartient le membre',
    enum: CommissionType,
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  commission?: string;
}

export class UpdateActivityCommitteeMemberDto {
  @ApiPropertyOptional({ enum: CommitteeMemberRole })
  @IsOptional()
  @IsEnum(CommitteeMemberRole)
  role?: CommitteeMemberRole;

  @ApiPropertyOptional({ description: 'Commission', enum: CommissionType })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  commission?: string;
}
