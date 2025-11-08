import { Injectable, NotFoundException } from '@nestjs/common';
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

  async create(createMemberResponsibilityDto: CreateMemberResponsibilityDto) {
    const member = await this.memberService.findOne(
      createMemberResponsibilityDto.member_uuid as string,
      null,
    );
    if (!member) {
      throw new NotFoundException('Membre non trouvé');
    }
    const responsibility = await this.responsibilityService.findOne(
      createMemberResponsibilityDto.responsibility_uuid as string,
      null,
    );
    if (!responsibility) {
      throw new NotFoundException('Responsabilité non trouvée');
    }
    const memberResponsibility = this.memberResponsibilityRepo.create({
      member_uuid: createMemberResponsibilityDto.member_uuid,
      member,
      responsibility_uuid: createMemberResponsibilityDto.responsibility_uuid,
      responsibility,
    });
    return this.memberResponsibilityRepo.save(memberResponsibility);
  }

  // async find
}
