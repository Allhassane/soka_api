import { Module } from '@nestjs/common';
import { MemberResponsibilityService } from './⁠member-responsibility.service';
import { MemberResponsibilityController } from './⁠member-responsibility.controller';

@Module({
  controllers: [MemberResponsibilityController],
  providers: [MemberResponsibilityService],
})
export class MemberResponsibilityModule {}
