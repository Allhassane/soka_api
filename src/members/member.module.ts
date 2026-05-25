import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MemberService } from './member.service';
import { MemberController } from './member.controller';
import { MemberEntity } from './entities/member.entity';
import { LogActivitiesModule } from 'src/log-activities/log-activities.module';
import { User } from 'src/users/entities/user.entity';
import { UserModule } from 'src/users/user.module';
import { ResponsibilityModule } from 'src/responsibilities/reponsibility.module';
import { MemberResponsibilityModule } from 'src/⁠member-responsibility/⁠member-responsibility.module';
import { CivilityEntity } from 'src/civilities/entities/civility.entity';
import { CivilityModule } from 'src/civilities/civility.module';
import { AccessoryModule } from 'src/accessories/accessory.module';
import { MemberResponsibilityEntity } from 'src/⁠member-responsibility/entities/member-responsibility.entity';
import { MemberAccessoryEntity } from 'src/member-accessories/entities/member-accessories.entity';
import { MemberAccessoryModule } from 'src/member-accessories/member-accessories.module';
import { StructureModule } from 'src/structure/structure.module';
import { MaritalStatusEntity } from 'src/marital-status/entities/marital-status.entity';
import { CountryEntity } from 'src/countries/entities/country.entity';
import { CityEntity } from 'src/cities/entities/city.entity';
import { FormationEntity } from 'src/formations/entities/formation.entity';
import { JobEntity } from 'src/jobs/entities/job.entity';
import { OrganisationCityEntity } from 'src/organisation_cities/entities/organisation_city.entity';
import { DepartmentEntity } from 'src/departments/entities/department.entity';
import { DivisionEntity } from 'src/divisions/entities/division.entity';
import { StructureEntity } from 'src/structure/entities/structure.entity';
import { ResponsibilityEntity } from 'src/responsibilities/entities/responsibility.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature(
      [
        MemberEntity,
        User,
        CivilityEntity,
        MemberResponsibilityEntity,
        MemberAccessoryEntity,
        MaritalStatusEntity,
        CountryEntity,
        CityEntity,
        FormationEntity,
        JobEntity,
        OrganisationCityEntity,
        DepartmentEntity,
        DivisionEntity,
        StructureEntity,
        ResponsibilityEntity
      ]),
    LogActivitiesModule,
    UserModule,
    ResponsibilityModule,
    CivilityModule,
    ResponsibilityModule,
    AccessoryModule,
    MemberAccessoryModule,
    StructureModule,

    forwardRef(() => MemberResponsibilityModule),
    StructureModule
  ],
  controllers: [MemberController],
  providers: [MemberService],
  exports: [MemberService],
})
export class MemberModule {}
