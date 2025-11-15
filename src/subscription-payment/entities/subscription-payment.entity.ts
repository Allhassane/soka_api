import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { GlobalStatus } from 'src/shared/enums/global-status.enum';

@Entity('subscription_payments')
export class SubscriptionPaymentEntity {
  @PrimaryGeneratedColumn('uuid')
  uuid: string;

  // Montant total payé
  @Column('int')
  amount: number;

  // Quantité (toujours >=1)
  @Column('int', { default: 1 })
  quantity: number;

  // Référence de la campagne d'abonnement
  @Column('uuid')
  subscription_uuid: string;

  // Bénéficiaire
  @Column('uuid')
  beneficiary_uuid: string;

  @Column()
  beneficiary_name: string;

  // Acteur / payeur
  @Column('uuid')
  actor_uuid: string;

  @Column()
  actor_name: string;

  // Paiement interne lié
  @Column('uuid')
  payment_uuid: string;

  // Statut global
  @Column({
    type: 'enum',
    enum: GlobalStatus,
    default: GlobalStatus.PENDING,
  })
  status: GlobalStatus;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
