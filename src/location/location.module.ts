import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { LocationService } from './location.service';
import { LocationController } from './location.controller';

@Module({
  imports: [HttpModule], // nécessaire pour HttpService
  providers: [LocationService],
  controllers: [LocationController],
})
export class LocationModule {}
