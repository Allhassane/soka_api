import { UpdateDonateDto } from './dto/update-donate.dto';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Donate } from './entities/donate.entity';
import { IsNull, Repository } from 'typeorm';
import { CreateDonateDto } from './dto/create-donate.dto';
import { GlobalStatus } from 'src/shared/enums/global-status.enum';

@Injectable()
export class DonatesService {

  constructor(
    @InjectRepository(Donate)
    private readonly donateRepo: Repository<Donate>,
  ) { }

  async findAll() {
    return this.donateRepo.find({ where: { deletedAt: IsNull() } });
  }

  async findOne(uuid: string) {
    const don = await this.donateRepo.findOneBy({ uuid });
    if (!don) throw new NotFoundException(`Donate #${uuid} not found`);
      return don;
  }

  async create(donateCreateDto: CreateDonateDto) {
    const donate = this.donateRepo.create(donateCreateDto);
    const result = this.donateRepo.save(donate);
    if(!result) {
      return 'Une erreur est survenue lors de la création de la campagne de don';
    }
    return 'Campagne de don créée avec succès';
  }

  async update(uuid: string, UpdateDonateDto: UpdateDonateDto) {
    const donate = await this.findOne(uuid);
    Object.assign(donate, UpdateDonateDto);
    const result = this.donateRepo.save(donate);
    if(!result) {
      return 'Une erreur est survenue lors de la mise à jour de la campagne de don';
    }
    return 'Campagne de don mise à jour avec succès';

  }

  async remove(uuid: string) {
    const donate = await this.findOne(uuid);
    if (!donate) {
      throw new NotFoundException('Campagne de don introuvable.');
    }
    //Soft delete
    await this.donateRepo.softRemove(donate);
    return { message: "Campagne de don supprimée avec succès (soft delete)" };
  }

  //changer le statut d'une campagne de don
  async updateStatus(uuid: string, status: GlobalStatus) {
    // Vérifie si le don existe
  const donate = await this.findOne(uuid);
  if (!donate) {
    throw new NotFoundException(`Don avec l'UUID ${uuid} introuvable`);
  }

  // Vérifie que le statut envoyé est valide
  if (!Object.values(GlobalStatus).includes(status)) {
    throw new BadRequestException(`Statut invalide. Valeurs acceptées : ${Object.values(GlobalStatus).join(', ')}`);
  }

  // Mise à jour du statut
  donate.status = status;
  const result = await this.donateRepo.save(donate);

  // Réponse structurée
  return {
    success: true,
    message: `Statut du don mis à jour avec succès (${status})`,
    data: result,
  };
}


}
