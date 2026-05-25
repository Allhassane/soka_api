import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MemberAccessoryEntity } from './entities/member-accessories.entity';
import { CreateMemberAccessoryDto } from './dtos/create-member-accessories.dto';
import { UpdateMemberAccessoryDto } from './dtos/update-member-accessories.dto';
import { MemberEntity } from 'src/members/entities/member.entity';
import { AccessoryEntity } from 'src/accessories/entities/accessory.entity';

@Injectable()
export class MemberAccessoryService {
  constructor(
    @InjectRepository(MemberAccessoryEntity)
    private readonly memberAccessoryRepo: Repository<MemberAccessoryEntity>,

    @InjectRepository(MemberEntity)
    private readonly memberRepo: Repository<MemberEntity>,

    @InjectRepository(AccessoryEntity)
    private readonly accessoryRepo: Repository<AccessoryEntity>,
  ) {}

  /** 🔹 Création du lien membre ↔ accessoire */
  async create(dto: CreateMemberAccessoryDto): Promise<MemberAccessoryEntity> {
    const member = await this.findMemberOrFail(dto.member_uuid);
    const accessory = await this.findAccessoryOrFail(dto.accessory_uuid);

    await this.ensureMemberAccessoryIsUnique(dto.member_uuid, dto.accessory_uuid);

    const memberAccessory = this.memberAccessoryRepo.create({
      member_uuid: member.uuid,
      accessory_uuid: accessory.uuid,
      member,
      accessory,
    });

    return await this.memberAccessoryRepo.save(memberAccessory);
  }

  /** 🔹 Mise à jour du lien */
  async update(uuid: string, dto: UpdateMemberAccessoryDto): Promise<MemberAccessoryEntity> {
    const memberAccessory = await this.findOneByUuid(uuid);

    if (dto.member_uuid) {
      const member = await this.findMemberOrFail(dto.member_uuid);
      memberAccessory.member = member;
      memberAccessory.member_uuid = dto.member_uuid;
    }

    if (dto.accessory_uuid) {
      const accessory = await this.findAccessoryOrFail(dto.accessory_uuid);
      memberAccessory.accessory = accessory;
      memberAccessory.accessory_uuid = dto.accessory_uuid;
    }

    Object.assign(memberAccessory, dto);
    return await this.memberAccessoryRepo.save(memberAccessory);
  }

  /** Liste paginée */
  async findAll(): Promise<MemberAccessoryEntity[]> {
    return await this.memberAccessoryRepo.find({
      relations: ['member', 'accessory'],
      order: { created_at: 'DESC' },
    });
  }


  /** Lecture par UUID */
  async findOneByUuid(uuid: string): Promise<MemberAccessoryEntity> {
    const memberAccessory = await this.memberAccessoryRepo.findOne({
      where: { uuid },
      relations: ['member', 'accessory'],
    });

    if (!memberAccessory)
      throw new NotFoundException('Lien membre/accessoire non trouvé');

    return memberAccessory;
  }


  async findOneMemberAndAccessory(member_uuid: string, accessory_uuid: string) {
    const memberAccessory = await this.memberAccessoryRepo.findOne({
      where: { member_uuid, accessory_uuid },
    });

    return memberAccessory;
  }

  /** Suppression logique */
  async softDelete(uuid: string): Promise<void> {
    const memberAccessory = await this.findOneByUuid(uuid);
    await this.memberAccessoryRepo.softDelete({ id: memberAccessory.id });
  }

  /** Vérifie l’unicité du lien membre/accessoire */
  private async ensureMemberAccessoryIsUnique(
    member_uuid: string,
    accessory_uuid: string,
  ): Promise<void> {
    const existing = await this.memberAccessoryRepo.findOne({
      where: { member_uuid, accessory_uuid },
    });

    if (existing) {
      throw new BadRequestException(
        'Cet accessoire est déjà assigné à ce membre.',
      );
    }
  }

  /** Vérifie l’existence du membre */
  private async findMemberOrFail(member_uuid: string): Promise<MemberEntity> {
    const member = await this.memberRepo.findOneBy({ uuid: member_uuid });
    if (!member) throw new NotFoundException('Membre introuvable');
    return member;
  }

  /** Vérifie l’existence de l’accessoire */
  private async findAccessoryOrFail(accessory_uuid: string): Promise<AccessoryEntity> {
    const accessory = await this.accessoryRepo.findOneBy({ uuid: accessory_uuid });
    if (!accessory) throw new NotFoundException('Accessoire introuvable');
    return accessory;
  }
}
