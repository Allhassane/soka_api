import { Module } from '@nestjs/common';
import { MemberTravelController } from './member-travel.controller';
import { MemberTravelService } from './member-travel.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MemberTravelEntity } from './entities/member-travel.entity';
import { MemberModule } from 'src/members/member.module';
import { CountryModule } from 'src/countries/country.module';

@Module({
  imports: [TypeOrmModule.forFeature([MemberTravelEntity]), MemberModule, CountryModule],
  controllers: [MemberTravelController],
  providers: [MemberTravelService]
})
export class MemberTravelModule {}
