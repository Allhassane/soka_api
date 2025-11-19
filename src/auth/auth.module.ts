import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { UserModule } from '../users/user.module';
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from '@nestjs/jwt';
import { AppConfigModule } from 'src/config/config.module';
import { AppConfigService } from 'src/config/config.service';
import { LocalStrategy } from './strategies/local.strategy';
import { JwtStrategy } from './strategies/jwt.strategy';
import { RoleModule } from 'src/roles/role.module';
import { MemberEntity } from 'src/members/entities/member.entity';
import { StructureEntity } from 'src/structure/entities/structure.entity';
import { LevelEntity } from 'src/level/entities/level.entity';

@Module({
  imports: [
    PassportModule,
    UserModule,
    AppConfigModule,
    RoleModule,
    TypeOrmModule.forFeature([
      MemberEntity,
      StructureEntity,
      LevelEntity,
    ]),
    JwtModule.registerAsync({
      imports: [AppConfigModule],
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) => ({
        secret: config.jwtSecret,
        signOptions: {
          expiresIn: parseInt(config.jwtExpiresIn as any, 10) || 86400,
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, LocalStrategy, JwtStrategy],
  exports: [AuthService],
})
export class AuthModule {}
