import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MemberAccessoryService } from './member-accessories.service';
import { MemberAccessoriesController } from './member-accessories.controller';
import { MemberAccessoryEntity } from './entities/member-accessories.entity';
import { MemberEntity } from 'src/members/entities/member.entity';
import { AccessoryEntity } from 'src/accessories/entities/accessory.entity';
@Module({
  imports: [
    TypeOrmModule.forFeature([
      MemberAccessoryEntity,
      MemberEntity,
      AccessoryEntity
    ]),
  ],
  controllers: [MemberAccessoriesController],
  providers: [MemberAccessoryService],
  exports: [MemberAccessoryService],
})
export class MemberAccessoryModule {}
