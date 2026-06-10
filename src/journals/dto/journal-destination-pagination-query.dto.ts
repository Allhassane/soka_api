import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';
import { PaginationQueryDto } from 'src/shared/dtos/pagination-query.dto';

export class JournalDestinationPaginationQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'UUID de la zone pour filtrer' })
  @IsOptional()
  @IsUUID()
  zone_uuid?: string;
}
