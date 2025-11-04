import { AuthModule } from 'src/auth/auth.module';
import { AppConfigModule } from 'src/config/config.module';
import { LevelModule } from 'src/level/level.module';
import { RoleModule } from 'src/roles/role.module';
import { TestModule } from 'src/tests/tests.module';
import { UserModule } from 'src/users/user.module';

export const AppModules = [
  TestModule,
  AppConfigModule,
  RoleModule,
  UserModule,
  AuthModule,
  LevelModule,
];
