import { IsIn, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { PaginationQueryDto } from 'src/shared/dtos/pagination-query.dto';
import { ROLE_STATUSES, RoleStatus } from '../entities/role.entity';

/**
 * Query de `GET /roles`. Le filtre `status` est OPTIONNEL : sans lui la liste renvoie tous les
 * rôles (désactivés compris, pour pouvoir les réactiver). Les sélecteurs de rôle appellent
 * `?status=enable`.
 * ⚠️ `ValidationPipe` est en `forbidNonWhitelisted` - tout paramètre non déclaré ici part en 400.
 */
export class FindRolesQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: ROLE_STATUSES, description: 'Filtre sur le statut du rôle' })
  @IsOptional()
  @IsIn(ROLE_STATUSES, {
    message: "Le filtre status doit valoir 'enable' ou 'disable'.",
  })
  status?: RoleStatus;
}
