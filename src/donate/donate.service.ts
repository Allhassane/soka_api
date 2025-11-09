import { Injectable } from '@nestjs/common';
import { DonateEntity } from './entities/donate.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateDonateDto } from './dto/create-donate.dto';

@Injectable()
export class DonateService {
  constructor(
    @InjectRepository(DonateEntity)
    private readonly donateRepo: Repository<DonateEntity>,
  ) {}

  async findAll(admin_uuid: string) {
    return this.donateRepo.find();
  }

  async create(createDonateDto: CreateDonateDto, admin_uuid: string) {
    return this.donateRepo.save({ ...createDonateDto, admin_uuid });
  }
}
