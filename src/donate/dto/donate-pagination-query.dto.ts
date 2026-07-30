import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { PaginationQueryDto } from 'src/shared/dtos/pagination-query.dto';

export class DonatePaginationQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Recherche par nom de campagne de zaimu' })
  @IsOptional()
  @IsString()
  search?: string;
}
