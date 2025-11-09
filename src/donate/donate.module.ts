import { Module } from '@nestjs/common';
import { DonateController } from './donate.controller';
import { DonateService } from './donate.service';

@Module({
  controllers: [DonateController],
  providers: [DonateService]
})
export class DonateModule {}
