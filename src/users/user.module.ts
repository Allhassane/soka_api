import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from './entities/user.entity';
import { Role } from '../roles/entities/role.entity';
import { UserController } from './user.controller';
import { UserService } from './user.service';
import { UserRole } from 'src/user-roles/entities/user-roles.entity';
import { LogActivitiesModule } from 'src/log-activities/log-activities.module';
import { MemberAccountService } from './member-account.service';

@Module({
  imports: [TypeOrmModule.forFeature([User, Role, UserRole]),LogActivitiesModule ],
  controllers: [UserController],
  // `MemberAccountService` est exporté : toute voie qui écrit un membre (formulaire, import)
  // doit passer par lui pour créer/réaligner le compte de connexion - cf. son en-tête.
  providers: [UserService, MemberAccountService],
  exports: [UserService, MemberAccountService],
})
export class UserModule {}
