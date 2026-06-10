import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { PaginationQueryDto } from 'src/shared/dtos/pagination-query.dto';

export class LevelPaginationQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Recherche par nom de niveau' })
  @IsOptional()
  @IsString()
  search?: string;
}
