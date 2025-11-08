import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppConfigService } from './config/config.service';
import { RoleModule } from './roles/role.module';
import { UserModule } from './users/user.module';
import { AuthModule } from './auth/auth.module';
import { LevelModule } from './level/level.module';
import { LogActivitiesModule } from './log-activities/log-activities.module';
import { ModuleModule } from './module/module.module';
import { PermissionModule } from './permission/permission.module';
import { RolePermissionController } from './role-permission/role-permission.controller';
import { RolePermissionService } from './role-permission/role-permission.service';
import { RolePermissionModule } from './role-permission/role-permission.module';
import { MailerModule } from '@nestjs-modules/mailer';
import { HandlebarsAdapter } from '@nestjs-modules/mailer/dist/adapters/handlebars.adapter';
import { CommitteeModule } from './committees/committee.module';
import { DepartmentModule } from './departments/department.module';
import { DivisionModule } from './divisions/division.module';
import { CityModule } from './cities/city.module';
import { CivilityModule } from './civilities/civility.module';
import { FormationModule } from './formations/formation.module';
import { UserRole } from './user-roles/entities/user-roles.entity';
import { UserRoleModule } from './user-roles/user-roles.module';
import { AccessoryModule } from './accessories/accessory.module';
import { MemberAccessoryModule } from './member-accessories/member-accessories.module';
import { MemberModule } from './members/member.module';


//import { PermissionsModule } from './permissions/permission.module';
@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) => ({
        type: 'mysql', //postgres
        host: config.dbHost,
        port: config.dbPort,
        username: config.dbUser,
        password: config.dbPassword,
        database: config.dbName,
        autoLoadEntities: true,
        synchronize: !config.isProd,
        ...(config.isProd && {
          entities: ['dist/**/*.entity.js'],
          migrations: ['dist/migrations/*.js'],
          migrationsRun: true,
        }),
      }),
    }),
    MailerModule.forRoot({
      transport: {
        host: process.env.MAIL_HOST,
        port: parseInt(process.env.MAIL_PORT ?? '587', 10),
        secure: false,
        auth: {
          user: process.env.MAIL_USERNAME,
          pass: process.env.MAIL_PASSWORD,
        },
      },
      defaults: {
        from: '"SOKA no-reply" <no-reply@' + process.env.APP_DOMAIN + '>',
      },
    }),
    RoleModule,
    UserModule,
    AuthModule,
    UserRole,
    UserRoleModule,
    LogActivitiesModule,
    ModuleModule,
    PermissionModule,
    RolePermissionModule,    
    //PermissionsModule,
    RolePermissionModule,  
    CommitteeModule,
    DepartmentModule,
    DivisionModule,
    DivisionModule,
    CityModule,
    CivilityModule,
    FormationModule,
    AccessoryModule,
    MemberAccessoryModule,
    MemberModule,
  ],
  controllers: [AppController, RolePermissionController],
  providers: [AppService, RolePermissionService],
})
export class AppModule {}
