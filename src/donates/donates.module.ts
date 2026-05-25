import { Module } from '@nestjs/common';
import { DonatesController } from './donates.controller';
import { DonatesService } from './donates.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Donate } from './entities/donate.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Donate])],
  controllers: [DonatesController],
  providers: [DonatesService]
})
export class DonatesModule {}
