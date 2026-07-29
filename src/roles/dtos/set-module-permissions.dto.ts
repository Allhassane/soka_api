import { IsBoolean } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * Corps de `PUT /roles/:roleUuid/modules/:moduleUuid/permissions` - applique le même statut à
 * toutes les permissions du module (case « tout cocher / tout décocher » de l'écran Rôles).
 */
export class SetModulePermissionsDto {
  @ApiProperty({
    description: 'Statut à appliquer à toutes les permissions du module',
    example: true,
  })
  @IsBoolean({ message: 'Le statut doit être un booléen (true ou false).' })
  status: boolean;
}
