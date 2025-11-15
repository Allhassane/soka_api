import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsNotEmpty, IsString, IsDate, IsOptional } from 'class-validator';

export class CreateMemberTravelDto {

  @ApiProperty({ description: 'UUID du membre', example: '123e4567-e89b-12d3-a456-426614174000' })
  @IsNotEmpty()
  @IsString()
  member_uuid: string;

  @ApiProperty({ description: 'UUID du pays', example: '123e4567-e89b-12d3-a456-426614174000' })
  @IsNotEmpty()
  @IsString()
  country_uuid: string;

  @ApiPropertyOptional({ description: 'Date du voyage', example: '2022-01-01' })
  @IsDate()
  @IsOptional()
  @Type(() => Date)
  traveled_at?: Date;

  @ApiPropertyOptional({ description: 'Description du voyage', example: 'Description du voyage' })
  @IsString()
  @IsOptional()
  about?: string;

  @ApiPropertyOptional({ description: 'UUID de l\'admin', example: '123e4567-e89b-12d3-a456-426614174000' })
  @IsString()
  @IsOptional()
  admin_uuid?: string;
}
