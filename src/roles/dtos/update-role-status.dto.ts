import { IsIn } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { ROLE_STATUSES, RoleStatus } from '../entities/role.entity';

/** Corps de `PATCH /roles/:uuid/status` - activation / désactivation réversible d'un rôle. */
export class UpdateRoleStatusDto {
  @ApiProperty({ enum: ROLE_STATUSES, example: 'disable' })
  @IsIn(ROLE_STATUSES, {
    message: "Le statut doit valoir 'enable' ou 'disable'.",
  })
  status: RoleStatus;
}
