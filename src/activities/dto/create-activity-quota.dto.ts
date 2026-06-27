import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsUUID, Min } from 'class-validator';

export class CreateActivityQuotaDto {
  @ApiProperty({ description: 'UUID de la structure concernée' })
  @IsUUID()
  structure_uuid: string;

  @ApiProperty({ description: 'Quota alloué à cette structure', minimum: 1 })
  @IsInt()
  @Min(1)
  quota_allocated: number;
}

export class UpdateActivityQuotaDto {
  @ApiPropertyOptional({ description: 'Quota alloué à cette structure', minimum: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  quota_allocated?: number;

  @ApiPropertyOptional({ description: 'Quota utilisé', minimum: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  quota_used?: number;
}
