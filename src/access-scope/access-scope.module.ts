import { Global, Module } from '@nestjs/common';
import { AccessScopeService } from './access-scope.service';
import { EffectivePermissionsService } from './effective-permissions.service';

/**
 * Droits et périmètre d'un membre, calculés en un seul endroit.
 *
 * `@Global` volontairement : le service est sans état, ne dépend que de la `DataSource`, et est
 * consommé par des modules très éloignés (auth, structure, membres, exports). L'alternative -
 * l'importer dans chaque module consommateur - multipliait les modifications de fichiers partagés
 * sans rien apporter.
 */
@Global()
@Module({
  // `EffectivePermissionsService` DOIT rester global : `PermissionsGuard` l'injecte, et ce garde
  // est instancié par `@UseGuards()` dans une quarantaine de modules. Sans portée globale, il
  // faudrait importer ce module dans chacun d'eux.
  providers: [AccessScopeService, EffectivePermissionsService],
  exports: [AccessScopeService, EffectivePermissionsService],
})
export class AccessScopeModule {}
