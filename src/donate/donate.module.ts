import { Module } from '@nestjs/common';
import { DonateController } from './donate.controller';
import { DonateService } from './donate.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DonateEntity } from './entities/donate.entity';

@Module({
  imports: [TypeOrmModule.forFeature([DonateEntity])],
  controllers: [DonateController],
  providers: [DonateService],
})
export class DonateModule {}
