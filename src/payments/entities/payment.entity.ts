import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { DateTimeEntity } from 'src/shared/entities/date-time.entity';
import { PaymentSource } from '../dto/create-payment.dto';
import { MemberEntity } from 'src/members/entities/member.entity';
import { GlobalStatus } from 'src/shared/enums/global-status.enum';

@Entity({ name: 'payments' })
export class PaymentEntity extends DateTimeEntity {
  @PrimaryGeneratedColumn()
  id: number;


  @Column({ type: 'char', length: 36, unique: true, default: () => '(UUID())' })
  uuid: string;

  // -----------------------------------------------------------
  // Source du paiement
  // -----------------------------------------------------------

  @Column({ type: 'enum', enum: PaymentSource })
  source: PaymentSource;

  @Column({ type: 'char', length: 36 })
  source_uuid: string;

  // -----------------------------------------------------------
  // Beneficiary (membre bénéficiaire)
  // -----------------------------------------------------------

  @Column({ type: 'char', length: 36 })
  beneficiary_uuid: string;

  @Column({ type: 'varchar', length: 36 })
  beneficiary_name: string;

  // Relation optionnelle vers Member (si tu veux)
  @ManyToOne(() => MemberEntity, { nullable: true })
  @JoinColumn({ name: 'beneficiary_uuid', referencedColumnName: 'uuid' })
  beneficiary?: MemberEntity;

  // -----------------------------------------------------------
  //  Actor (personne ayant effectué l’action)
  // -----------------------------------------------------------

  @Column({ type: 'char', length: 36 })
  actor_uuid: string;

  @Column({ type: 'varchar', length: 191 })
  actor_name: string;

  @ManyToOne(() => MemberEntity, { nullable: true })
  @JoinColumn({ name: 'actor_uuid', referencedColumnName: 'uuid' })
  actor?: MemberEntity;

  // -----------------------------------------------------------
  //  Montant & Quantité
  // -----------------------------------------------------------

  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true })
  amount: number | null;

  @Column({ type: 'int', nullable: true })
  quantity: number | null;

  // -----------------------------------------------------------
  // Montant total (optionnel mais recommandé)
  // -----------------------------------------------------------

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  total_amount: number;


  @Column({
    nullable: false,
    type: 'enum',
    enum: GlobalStatus,
    default: GlobalStatus.INIT,
  })
  status: string;

  @Column({ type: 'varchar', length: 191, nullable: true })
  transaction_id: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  payment_url: string;

  @Column({ type: 'varchar', length: 50, default: GlobalStatus.PENDING })
  payment_status: GlobalStatus;

}
