import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SubscriptionEntity } from './entities/subscription.entity';
import { LogActivitiesService } from '../log-activities/log-activities.service';
import { User } from '../users/entities/user.entity';
import { CreateSubscriptionDto } from './dto/create-subscription.dto';
import { UpdateSubscriptionDto } from './dto/update-subscription.dto';
import { GlobalStatus } from 'src/shared/enums/global-status.enum';

@Injectable()
export class SubscriptionService {
  constructor(
    @InjectRepository(SubscriptionEntity)
    private readonly subscriptionRepo: Repository<SubscriptionEntity>,
    private readonly logService: LogActivitiesService,
    
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {}

  async findAll(admin_uuid: string) {
    const subscription = await this.subscriptionRepo.find({
      order: { name: 'DESC' },
    });

    const admin = await this.userRepo.findOne({ where: { uuid: admin_uuid } });
    
    if (!admin) {
        throw new NotFoundException("Identifiant de l'auteur introuvable");
    }

    await this.logService.logAction(
      'subscriptions-findAll',
      admin.id,
      'recupération de la liste de tous les formations'
    );

    return subscription;
  }

  
  async findOne(uuid: string,admin_uuid) {
    const subscription = await this.subscriptionRepo.findOne({ where: { uuid } });

    if (!subscription) {
        throw new NotFoundException('Aucune abonnement trouvé');
    }
    const admin = await this.userRepo.findOne({ where: { uuid: admin_uuid } });
    
    if (!admin) {
        throw new NotFoundException("Identifiant de l'auteur introuvable");
    }

    await this.logService.logAction(
      'subscriptions-findOne',
      admin.id,
      'Recupérer un division'
    );

    return subscription;
  }

    async store(payload: CreateSubscriptionDto, admin_uuid: string) {

      if (!payload?.name) {
        throw new BadRequestException('Veuillez renseigner tous les champs obligatoires.');
      }

      const admin = await this.userRepo.findOne({ where: { uuid: admin_uuid } });
      if (!admin) {
        throw new NotFoundException("Identifiant de l'auteur introuvable");
      }

      const history = {
        action: "Création d'un abonnement",
        table_action: "subscription-store",
        performed_by: `${admin.firstname} ${admin.lastname}`,
        data: payload,
        admin_uuid: admin_uuid,
        performed_at: new Date(),
      };

      const newSubscription = this.subscriptionRepo.create({
        ...payload,
        admin_uuid,
        status:GlobalStatus.STARTED,
        history: JSON.stringify(history), 
      });

      const saved = await this.subscriptionRepo.save(newSubscription);

      // Journalisation
      await this.logService.logAction(
        'subscription-store',
        admin.id,
        `Création de l’abonnement "${saved.name}" par ${admin.firstname} ${admin.lastname}`
      );

      return saved;
    }

    async update(uuid: string, payload: UpdateSubscriptionDto, admin_uuid: string) {
    
    const admin = await this.userRepo.findOne({ where: { uuid: admin_uuid } });
    if (!admin) {
      throw new NotFoundException("Identifiant de l'auteur introuvable");
    }

    const subscription = await this.subscriptionRepo.findOne({ where: { uuid } });
    if (!subscription) {
      throw new NotFoundException("Abonnement introuvable");
    }

    Object.assign(subscription, {
      ...payload,
      admin_uuid: admin_uuid,
      updated_at: new Date(),
    });

    // Création d'une nouvelle entrée d'historique
    const historyEntry = {
      action: "Mise à jour d'un abonnement",
      table_action: "subscription-update",
      performed_by: `${admin.firstname} ${admin.lastname}`,
      data: payload,
      admin_uuid,
      performed_at: new Date(),
    };

    // Ajout à l'historique existant (s’il existe déjà)
    let historyArray: any[] = [];
    if (subscription.history) {
      try {
        historyArray = JSON.parse(subscription.history);
        if (!Array.isArray(historyArray)) historyArray = [historyArray];
      } catch {
        historyArray = [];
      }
    }
    historyArray.push(historyEntry);
    subscription.history = JSON.stringify(historyArray);

    const updated = await this.subscriptionRepo.save(subscription);

    // Journalisation
    await this.logService.logAction(
      'subscriptions-update',
      admin.id,
      `Mise à jour de l’abonnement "${updated.name}" par ${admin.firstname} ${admin.lastname}`
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
    const subscription = await this.subscriptionRepo.findOne({ where: { uuid } });
    if (!subscription) {
      throw new NotFoundException('Abonnement introuvable');
    }

    // Validation du statut selon GlobalStatus
    const allowedStatuses = Object.values(GlobalStatus);
    if (!allowedStatuses.includes(status)) {
      throw new BadRequestException(
        `Statut invalide. Valeurs autorisées : ${allowedStatuses.join(', ')}`
      );
    }

    // Mise à jour du statut
    subscription.status = status;
    subscription.updated_at = new Date();

    // Ajout d'une trace dans l'historique
    const historyEntry = {
      action: `Changement de statut en "${status}"`,
      table_action: 'subscription-status-change',
      performed_by: `${admin.firstname} ${admin.lastname}`,
      admin_uuid,
      performed_at: new Date(),
    };

    let historyArray: any[] = [];
    if (subscription.history) {
      try {
        historyArray = JSON.parse(subscription.history);
        if (!Array.isArray(historyArray)) historyArray = [historyArray];
      } catch {
        historyArray = [];
      }
    }

    historyArray.push(historyEntry);
    subscription.history = JSON.stringify(historyArray);

    const updated = await this.subscriptionRepo.save(subscription);

    // Journalisation
    await this.logService.logAction(
      'subscription-status-change',
      admin.id,
      `Changement du statut de "${updated.name}" en "${status}" par ${admin.firstname} ${admin.lastname}`
    );

    return updated;
  }

  async delete(uuid: string,admin_uuid:string) {
    const subscription = await this.subscriptionRepo.findOne({ where: { uuid } });

    if (!subscription) {
        throw new NotFoundException('Aucun élément trouvé');
    }

    const admin = await this.userRepo.findOne({ where: { uuid: admin_uuid } });
    
    if (!admin) {
        throw new NotFoundException("Identifiant de l'auteur introuvable");
    }

    await this.logService.logAction(
      'subscription-delete',
      admin.id,
      "Suppression de l'abonnement "+subscription.name+" par "+admin.firstname+" "+admin.lastname+" pour uuid "+subscription.uuid,
    );

   return await this.subscriptionRepo.softRemove(subscription);

  }
}
