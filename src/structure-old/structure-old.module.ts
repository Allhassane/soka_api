import { Module } from '@nestjs/common';
import { StructureOldService } from './structure-old.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StructureOldEntity } from './entities/structure.entity';

@Module({
  imports: [TypeOrmModule.forFeature([StructureOldEntity])],
  providers: [StructureOldService],
  exports: [StructureOldService],
})
export class StructureOldModule {}
