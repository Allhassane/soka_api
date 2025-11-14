import { DateTimeEntity } from 'src/shared/entities/date-time.entity';
import { GlobalStatus } from 'src/shared/enums/global-status.enum';
import { Entity, PrimaryGeneratedColumn, Column} from 'typeorm';

function slugify(s: string) {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036F]/g, '') // accents
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '');
}

@Entity({ name: 'subscriptions' })
export class SubscriptionEntity extends DateTimeEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'char', length: 36, unique: true, default: () => '(UUID())' })
  uuid: string;

  @Column()
  name: string;
  
  @Column({ nullable: true, default: 0, type: 'double' })
  amount: number;

  @Column()
  year: number;

  
  @Column()
  starts_at: Date;

  @Column()
  stops_at: Date;

  @Column({type:"longtext", nullable:true})
  history: string;


  @Column({ type: 'varchar', length: 36 })
  admin_uuid: string;

  @Column({ type: 'enum', enum:GlobalStatus, default:GlobalStatus.CREATED })
  status: string;

}
