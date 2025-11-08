import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MemberResponsibilityEntity } from './entities/member-responsibility.entity';
import { Repository } from 'typeorm';
import { CreateMemberResponsibilityDto } from './dto/create-member-responsibility.dto';
import { ResponsibilityService } from 'src/responsibilities/reponsibility.service';
import { MemberService } from 'src/members/member.service';

@Injectable()
export class MemberResponsibilityService {
  constructor(
    @InjectRepository(MemberResponsibilityEntity)
    private readonly memberResponsibilityRepo: Repository<MemberResponsibilityEntity>,
    private readonly memberService: MemberService,
    private readonly responsibilityService: ResponsibilityService,
  ) {}
}
