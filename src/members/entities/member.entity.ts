import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  BeforeInsert,
  BeforeUpdate,
  OneToMany,
} from 'typeorm';
import { MemberAccessoryEntity } from 'src/member-accessories/entities/member-accessories.entity';
import { DateTimeEntity } from 'src/shared/entities/date-time.entity';

function slugify(s: string) {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036F]/g, '') // accents
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '');
}

@Entity({ name: 'members' })
export class MemberEntity extends DateTimeEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'char', length: 36, unique: true, default: () => '(UUID())' })
  uuid: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  picture: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  matricule: string;

  @Column({ type: 'varchar', length: 100, collation: 'utf8mb4_unicode_ci' })
  firstname: string;

  @Column({ type: 'varchar', length: 100, collation: 'utf8mb4_unicode_ci' })
  lastname: string;

  @Column({ type: 'enum', enum: ['homme', 'femme'] })
  gender: string;

  @Column({ type: 'date', nullable: true })
  birth_date: Date;

  @Column({ type: 'varchar', length: 191, nullable: true })
  birth_city: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  civility_uuid: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  marital_status_uuid: string;

  @Column({ type: 'varchar', length: 100, nullable: true, collation: 'utf8mb4_unicode_ci' })
  spouse_name: string;

  @Column({ type: 'boolean', default: false })
  spouse_member: boolean;

  @Column({ type: 'int', default: 0 })
  childrens: number;

  @Column({ type: 'uuid', nullable: true })
  country_uuid: string;

  @Column({ type: 'uuid', nullable: true })
  city_uuid: string;

  @Column({ type: 'varchar', length: 191, nullable: true })
  town: string;

  @Column({ type: 'uuid', nullable: true })
  formation_uuid: string;

  @Column({ type: 'uuid', nullable: true })
  job_uuid: string;

  @Column({ type: 'varchar', length: 30, nullable: true })
  phone: string;

  @Column({ type: 'varchar', length: 30, nullable: true })
  phone_whatsapp: string;

  @Column({ type: 'varchar', length: 191, nullable: true })
  email: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  tutor_name: string;

  @Column({ type: 'varchar', length: 30, nullable: true })
  tutor_phone: string;

  @Column({ type: 'uuid', nullable: true })
  organisation_city_uuid: string;

  @Column({ type: 'date', nullable: true })
  membership_date: Date;

  @Column({ type: 'boolean', default: false })
  sokahan_byakuren: boolean;

  @Column({ type: 'uuid', nullable: true })
  department_uuid: string;

  @Column({ type: 'uuid', nullable: true })
  division_uuid: string;

  @Column({ type: 'boolean', default: false })
  has_gohonzon: boolean;

  @Column({ type: 'date', nullable: true })
  date_gohonzon: Date;

  @Column({ type: 'boolean', default: false })
  has_tokusso: boolean;

  @Column({ type: 'date', nullable: true })
  date_tokusso: Date;

  @Column({ type: 'boolean', default: false })
  has_omamori: boolean;

  @Column({ type: 'date', nullable: true })
  date_omamori: Date;

  /** Structure */
  @Column({ type: 'int', nullable: true })
  structure_id: number;

  @Column({ type: 'varchar', length: 191, nullable: true })
  structure_uuid: string;

  @Column({ type: 'varchar', length: 36 })
  admin_uuid: string;

  @Column({ type: 'varchar', length: 36, default: 'enable' })
  status: string;

  /** Relations */
  @OneToMany(() => MemberAccessoryEntity, (ma) => ma.member)
  member_accessories: MemberAccessoryEntity[];
}
