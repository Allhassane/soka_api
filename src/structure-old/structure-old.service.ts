import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { StructureOldEntity } from './entities/structure.entity';

@Injectable()
export class StructureOldService {
  constructor(
    @InjectRepository(StructureOldEntity)
    private readonly structureRepo: Repository<StructureOldEntity>,
  ) {}

  async findAll() {
    return await this.structureRepo.find();
  }
}
