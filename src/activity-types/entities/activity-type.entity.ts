import { DateTimeEntity } from 'src/shared/entities/date-time.entity';
import { Entity, PrimaryGeneratedColumn, Column, BeforeInsert, Index } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';

export enum ActivityTypeFamily {
  TRADITIONNELLE = 'traditionnelle',
  SPORADIQUE = 'sporadique',
}

export enum ActivityTypeSubcategory {
  MENSUELLE_DEPARTEMENT = 'mensuelle_departement',
  GRANDE_COMMEMORATION = 'grande_commemoration',
  ZANDAKAI = 'zandakai',
  GONGYO_KOSEN_RUFU = 'gongyo_kosen_rufu',
  GONGYO_LENT = 'gongyo_lent',
  SPORADIQUE_NATIONALE = 'sporadique_nationale',
  SPORADIQUE_LOCALE = 'sporadique_locale',
}

@Entity({ name: 'activity_types' })
export class ActivityTypeEntity extends DateTimeEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'char', length: 36, unique: true })
  uuid: string;

  @BeforeInsert()
  ensureUuid() {
    this.uuid = this.uuid ?? uuidv4();
  }

  @Column({ type: 'varchar', length: 191 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Index()
  @Column({ type: 'enum', enum: ActivityTypeFamily })
  family: ActivityTypeFamily;

  @Column({ type: 'enum', enum: ActivityTypeSubcategory, nullable: true })
  subcategory: ActivityTypeSubcategory | null;

  /** Ce type d'activité implique-t-il une gestion de quotas par structure ? */
  @Column({ type: 'boolean', default: false })
  requires_quota: boolean;

  /** Ce type d'activité nécessite-t-il un comité d'organisation ? */
  @Column({ type: 'boolean', default: false })
  requires_committee: boolean;

  /** Règle de récurrence par défaut héritée lors de la création d'une activité de ce type.
   *  Ex : "weekly:sunday", "monthly:3rd-sunday" */
  @Column({ type: 'varchar', length: 255, nullable: true })
  default_recurrence_rule: string | null;

  /** Niveau d'exécution attendu : national, region, centre, district, groupe, sous_groupe */
  @Column({ type: 'varchar', length: 64, nullable: true })
  execution_level: string | null;

  @Column({ type: 'char', length: 36 })
  admin_uuid: string;

  @Column({ type: 'varchar', length: 36, default: 'enable' })
  status: string;
}
