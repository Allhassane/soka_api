import { Injectable } from '@nestjs/common';
import {
  DataSource,
  EntitySubscriberInterface,
  EventSubscriber,
  InsertEvent,
} from 'typeorm';
import { User } from 'src/users/entities/user.entity';
import { UserRoleService } from './user-roles.service';

/**
 * Garantit l'invariant : **tout utilisateur porte au moins une ligne dans `user_roles`.**
 *
 * Pourquoi un subscriber plutôt qu'un appel explicite : les utilisateurs sont créés depuis
 * QUATRE endroits (`UserService.create`, `createUserByMigration`, le seed superadmin de
 * `onModuleInit`, et la création d'un membre dans `MemberService` — cette dernière à l'intérieur
 * d'une transaction, via `manager.save`). Un appel explicite à chaque endroit serait oublié au
 * cinquième. Le hook `afterInsert` couvre toutes les voies, présentes et futures, et s'exécute
 * dans la **même transaction** que l'insertion (`event.manager`) : pas d'utilisateur sans rôle,
 * même si la transaction est annulée ensuite.
 *
 * Le rattrapage des comptes déjà en base est fait par la migration `BackfillUserRoles`.
 */
@Injectable()
@EventSubscriber()
export class UserDefaultRoleSubscriber
  implements EntitySubscriberInterface<User>
{
  constructor(
    dataSource: DataSource,
    private readonly userRoleService: UserRoleService,
  ) {
    // Enregistrement manuel : c'est la voie documentée par NestJS pour un subscriber
    // qui a besoin de l'injection de dépendances.
    dataSource.subscribers.push(this);
  }

  listenTo() {
    return User;
  }

  async afterInsert(event: InsertEvent<User>): Promise<void> {
    await this.userRoleService.ensureDefaultRole(event.manager, event.entity);
  }
}
