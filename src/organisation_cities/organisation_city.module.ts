import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OrganisationCityService } from './organisation_city.service';
import { OrganisationCityController } from './organisation_city.controller';
import { OrganisationCityEntity } from './entities/organisation_city.entity';
import { LogActivitiesModule } from 'src/log-activities/log-activities.module';
import { User } from 'src/users/entities/user.entity';
import { UserModule } from 'src/users/user.module';

@Module({
  imports: [TypeOrmModule.forFeature([OrganisationCityEntity,User]),LogActivitiesModule,UserModule],
  controllers: [OrganisationCityController],
  providers: [OrganisationCityService],
  exports: [OrganisationCityService],
})
export class OrganisationCityModule {}
