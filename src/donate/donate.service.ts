import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DonateEntity } from './entities/donate.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateDonateDto } from './dto/create-donate.dto';
import { User } from 'src/users/entities/user.entity';
import { LogActivitiesService } from 'src/log-activities/log-activities.service';
import { GlobalStatus } from 'src/shared/enums/global-status.enum';
import { UpdateDonateDto } from './dto/update-donate.dto';

@Injectable()
export class DonateService {
  constructor(
    @InjectRepository(DonateEntity)
    private readonly donateRepo: Repository<DonateEntity>,
    private readonly logService: LogActivitiesService,

    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) { }

  async findAll(admin_uuid: string) {
    const admin = await this.userRepo.findOne({ where: { uuid: admin_uuid } });
    if (!admin) {
      throw new NotFoundException("Identifiant de l'auteur introuvable");
    }

    await this.logService.logAction(
      'donate-findAll',
      admin.id,
      'recupération de la liste de tous les dons'
    );

    return this.donateRepo.find();
  }

  async findOne(uuid: string, admin_uuid: string) {
    const admin = await this.userRepo.findOne({ where: { uuid: admin_uuid } });
    if (!admin) {
      throw new NotFoundException("Identifiant de l'auteur introuvable");
    }

    const donate = await this.donateRepo.findOne({ where: { uuid } });
    if (!donate) {
      throw new NotFoundException('Don introuvable');
    }

    // Journalisation
    await this.logService.logAction(
      'donate-findOne',
      admin.id,
      `Consultation du don "${donate.name}"`,
    );

    return donate;
  }

  async create(createDonateDto: CreateDonateDto, admin_uuid: string) {
    const admin = await this.userRepo.findOne({ where: { uuid: admin_uuid } });
    if (!admin) {
      throw new NotFoundException("Identifiant de l'auteur introuvable");
    }

    const history = {
      action: "Création d'un don",
      table_action: "donate-store",
      performed_by: `${admin.firstname} ${admin.lastname}`,
      data: createDonateDto,
      admin_uuid: admin_uuid,
      performed_at: new Date(),
    };

    const saved = this.donateRepo.save({
      ...createDonateDto,
      status: GlobalStatus.STARTED,
      history: JSON.stringify(history),
      admin_uuid
    });

    // Journalisation
    await this.logService.logAction(
      'subscription-store',
      admin.id,
      `Création de l’abonnement "${createDonateDto.name}" par ${admin.firstname} ${admin.lastname}`
    );


    return saved;
  }

  async update(uuid: string, updateDonateDto: UpdateDonateDto, admin_uuid: string) {

    const admin = await this.userRepo.findOne({ where: { uuid: admin_uuid } });
    if (!admin) {
      throw new NotFoundException("Identifiant de l'auteur introuvable");
    }

    const donate = await this.donateRepo.findOne({ where: { uuid } });
    if (!donate) {
      throw new NotFoundException("Don introuvable");
    }

    Object.assign(donate, {
      ...updateDonateDto,
      updated_at: new Date(),
    });

    const historyEntry = {
      action: "Mise à jour d'un don",
      table_action: "donate-update",
      performed_by: `${admin.firstname} ${admin.lastname}`,
      data: updateDonateDto,
      admin_uuid,
      performed_at: new Date(),
    };

    let historyArray: any[] = [];
    if (donate.history) {
      try {
        historyArray = JSON.parse(donate.history);
        if (!Array.isArray(historyArray)) historyArray = [historyArray];
      } catch {
        historyArray = [];
      }
    }
    historyArray.push(historyEntry);
    donate.history = JSON.stringify(historyArray);

    const updated = await this.donateRepo.save(donate);

    // Journalisation
    await this.logService.logAction(
      'donate-update',
      admin.id,
      `Mise à jour du don "${updated.name}" par ${admin.firstname} ${admin.lastname}`,
    );

    return updated;
  }

  async changeStatus(uuid: string, status: GlobalStatus, admin_uuid: string) {
    // Vérification de l'administrateur
    const admin = await this.userRepo.findOne({ where: { uuid: admin_uuid } });
    if (!admin) {
      throw new NotFoundException("Identifiant de l'auteur introuvable");
    }

    // Vérification de l'abonnement existant
    const donate = await this.donateRepo.findOne({ where: { uuid } });
    if (!donate) {
      throw new NotFoundException('Don introuvable');
    }

    // Validation du statut selon GlobalStatus
    const allowedStatuses = Object.values(GlobalStatus);
    if (!allowedStatuses.includes(status)) {
      throw new BadRequestException(
        `Statut invalide. Valeurs autorisées : ${allowedStatuses.join(', ')}`
      );
    }

    // Mise à jour du statut
    donate.status = status;
    donate.updated_at = new Date();

    // Ajout d'une trace dans l'historique
    const historyEntry = {
      action: `Changement de statut en "${status}"`,
      table_action: 'donate-status-change',
      performed_by: `${admin.firstname} ${admin.lastname}`,
      admin_uuid,
      performed_at: new Date(),
    };

    let historyArray: any[] = [];
    if (donate.history) {
      try {
        historyArray = JSON.parse(donate.history);
        if (!Array.isArray(historyArray)) historyArray = [historyArray];
      } catch {
        historyArray = [];
      }
    }

    historyArray.push(historyEntry);
    donate.history = JSON.stringify(historyArray);

    const updated = await this.donateRepo.save(donate);

    // Journalisation
    await this.logService.logAction(
      'donate-status-change',
      admin.id,
      `Changement du statut de "${updated.name}" en "${status}" par ${admin.firstname} ${admin.lastname}`
    );

    return updated;
  }

  async delete(uuid: string,admin_uuid:string) {
    const donate = await this.donateRepo.findOne({ where: { uuid } });

    if (!donate) {
        throw new NotFoundException('Aucun élément trouvé');
    }

    const admin = await this.userRepo.findOne({ where: { uuid: admin_uuid } });
    
    if (!admin) {
        throw new NotFoundException("Identifiant de l'auteur introuvable");
    }

    await this.logService.logAction(
      'subscription-delete',
      admin.id,
      "Suppression du don "+donate.name+" par "+admin.firstname+" "+admin.lastname+" pour uuid "+donate.uuid,
    );

    return await this.donateRepo.softRemove(donate);
  }

}
