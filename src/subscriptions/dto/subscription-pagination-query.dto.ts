import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { PaginationQueryDto } from 'src/shared/dtos/pagination-query.dto';

export class SubscriptionPaginationQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Recherche par nom d\'abonnement' })
  @IsOptional()
  @IsString()
  search?: string;
}
