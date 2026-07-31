import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { PaginationQueryDto } from 'src/shared/dtos/pagination-query.dto';

export class DonatePaginationQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Recherche par nom de campagne de zaimu' })
  @IsOptional()
  @IsString()
  search?: string;

  /**
   * Statut des campagnes à afficher. **Absent = seules les campagnes en cours** (`started`).
   * `all` renvoie tous les statuts. Toute valeur autre que l'absence exige le droit de filtrer
   * (cf. `resoudreStatutCampagne`).
   */
  @ApiPropertyOptional({
    description: "Statut à afficher (absent = en cours uniquement, 'all' = tous)",
    example: 'started',
  })
  @IsOptional()
  @IsString()
  status?: string;
}
