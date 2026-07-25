import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserRoleService } from './user-roles.service';
import { UserRoleController } from './user-roles.controller';
import { UserRole } from './entities/user-roles.entity';
import { User } from 'src/users/entities/user.entity';
import { Role } from 'src/roles/entities/role.entity';
import { UserDefaultRoleSubscriber } from './user-default-role.subscriber';
@Module({
  imports: [
    TypeOrmModule.forFeature([
      UserRole,
      User,
      Role
    ]),
  ],
  controllers: [UserRoleController],
  // `UserDefaultRoleSubscriber` s'enregistre lui-même sur la DataSource (cf. son constructeur) :
  // il suffit qu'il soit instancié comme provider pour que le hook `afterInsert` soit actif.
  providers: [UserRoleService, UserDefaultRoleSubscriber],
  exports: [UserRoleService],
})
export class UserRoleModule {}
