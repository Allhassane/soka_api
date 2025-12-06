import { Module } from '@nestjs/common';
import { MigrationService } from './migration.service';
import { MigrationController } from './migration.controller';
import { DepartmentModule } from 'src/departments/department.module';
import { DivisionModule } from 'src/divisions/division.module';
import { CivilityModule } from 'src/civilities/civility.module';
import { MemberModule } from 'src/members/member.module';
import { MaritalStatusModule } from 'src/marital-status/marital-status.module';
import { CountryModule } from 'src/countries/country.module';
import { CityModule } from 'src/cities/city.module';
import { FormationModule } from 'src/formations/formation.module';
import { JobModule } from 'src/jobs/job.module';
import { OrganisationCityModule } from 'src/organisation_cities/organisation_city.module';
import { StructureModule } from 'src/structure/structure.module';
import { LevelModule } from 'src/level/level.module';
import { AccessoryModule } from 'src/accessories/accessory.module';
import { MemberAccessoryModule } from 'src/member-accessories/member-accessories.module';
import { ResponsibilityModule } from 'src/responsibilities/reponsibility.module';
import { MemberResponsibilityModule } from 'src/⁠member-responsibility/⁠member-responsibility.module';
import { UserModule } from 'src/users/user.module';
import { RoleModule } from 'src/roles/role.module';

@Module({
  providers: [MigrationService],
  controllers: [MigrationController],
  imports: [
    DepartmentModule, 
    DivisionModule, 
    CivilityModule, 
    MemberModule, 
    MaritalStatusModule, 
    CountryModule, 
    CityModule, 
    FormationModule, 
    JobModule, 
    OrganisationCityModule, 
    StructureModule, 
    ResponsibilityModule, 
    LevelModule, 
    AccessoryModule, 
    MemberAccessoryModule, 
    MemberResponsibilityModule,
    UserModule,
    RoleModule
  ]
})
export class MigrationModule {}
