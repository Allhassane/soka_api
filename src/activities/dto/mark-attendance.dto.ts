import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsDate,
  IsOptional,
  IsString,
  IsUUID,
  ValidateNested,
} from 'class-validator';

export class MarkAttendanceDto {
  @ApiProperty({ description: 'UUID du membre' })
  @IsUUID()
  member_uuid: string;

  @ApiProperty({ description: 'Présent ?', example: true })
  @IsBoolean()
  present: boolean;

  @ApiPropertyOptional({ description: 'Heure d’arrivée' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  arrived_at?: Date;

  @ApiPropertyOptional({ description: 'Commentaire' })
  @IsOptional()
  @IsString()
  comment?: string;
}

export class BulkMarkAttendanceDto {
  @ApiProperty({ type: [MarkAttendanceDto], description: 'Liste des marquages' })
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => MarkAttendanceDto)
  items: MarkAttendanceDto[];
}
