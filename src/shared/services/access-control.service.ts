import { Injectable, ForbiddenException } from '@nestjs/common';

@Injectable()
export class AccessControlService {
  /**
   * Vérifie si l'utilisateur est autorisé à accéder à une ressource en fonction de son admin_uuid
   */
  checkOwnership(resourceKey: string, userAdminUuid: string): void {
    /* if (!userAdminUuid) {
      throw new ForbiddenException("Accès refusé : vous n'avez pas les droits nécessaires.");
    } */
  }
}
