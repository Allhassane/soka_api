import { Injectable, NotFoundException } from '@nestjs/common';
import { CreateMemberTravelDto } from './dtos/create-member-travel.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { MemberTravelEntity } from './entities/member-travel.entity';
import { Repository } from 'typeorm';
import { MemberService } from 'src/members/member.service';
import { CountryService } from 'src/countries/country.service';

@Injectable()
export class MemberTravelService {

    constructor(
        @InjectRepository(MemberTravelEntity)
        private readonly memberTravelRepository: Repository<MemberTravelEntity>,
        private readonly memberService: MemberService,
        private readonly countryService: CountryService,
    ) {}

    async store(payload: CreateMemberTravelDto, admin_uuid: string) {

        const member = await this.memberService.findOneByUuid(payload.member_uuid);

        if(!member){
            throw new NotFoundException('Membre non trouvé');
        }

        const country = await this.countryService.findByUuid(payload.country_uuid);

        if(!country){
            throw new NotFoundException('Pays non trouvé');
        }

        const memberTravel = this.memberTravelRepository.create({
            ...payload,
            admin_uuid,
        });
        return this.memberTravelRepository.save(memberTravel);
    }

    async findAll(member_uuid: string) {
        return this.memberTravelRepository.find({
            where: {
                member_uuid,
            },
            relations: ['country'],
            order: {
                traveled_at: 'DESC',
            },
        });
    }

    async findOne(uuid: string) {
        const memberTravel = await this.memberTravelRepository.findOne({ where: { uuid }, relations: ['country'] });

        if(!memberTravel){
            throw new NotFoundException('Voyage non trouvé');
        }

        return memberTravel;
    }

    async delete(uuid: string) {
        const memberTravel = await this.memberTravelRepository.findOne({ where: { uuid } });

        if(!memberTravel){
            throw new NotFoundException('Voyage non trouvé');
        }

        await this.memberTravelRepository.softDelete(uuid);

        return {
            message: 'Voyage supprimé avec succès',
        };
    }
}
