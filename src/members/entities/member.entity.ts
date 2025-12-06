import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  BeforeInsert,
  BeforeUpdate,
  OneToMany,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { MemberAccessoryEntity } from 'src/member-accessories/entities/member-accessories.entity';
import { DateTimeEntity } from 'src/shared/entities/date-time.entity';
import { CivilityEntity } from 'src/civilities/entities/civility.entity';
import { MaritalStatusEntity } from 'src/marital-status/entities/marital-status.entity';
import { CountryEntity } from 'src/countries/entities/country.entity';
import { CityEntity } from 'src/cities/entities/city.entity';
import { FormationEntity } from 'src/formations/entities/formation.entity';
import { JobEntity } from 'src/jobs/entities/job.entity';
import { OrganisationCityEntity } from 'src/organisation_cities/entities/organisation_city.entity';
import { DepartmentEntity } from 'src/departments/entities/department.entity';
import { DivisionEntity } from 'src/divisions/entities/division.entity';
import { StructureEntity } from 'src/structure/entities/structure.entity';
import { MemberResponsibilityEntity } from 'src/⁠member-responsibility/entities/member-responsibility.entity';
import { MemberTravelEntity } from 'src/member-travel/entities/member-travel.entity';
import { v4 as uuid } from 'uuid';

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

  @Column({ type: 'char', length: 36, unique: true })
  uuid: string;

  @BeforeInsert()
  ensureUuid() {
    this.uuid = this.uuid ?? uuid();
  }


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

  @ManyToOne(() => CivilityEntity, { nullable: true })
  @JoinColumn({ name: 'civility_uuid', referencedColumnName: 'uuid' })
  civility: CivilityEntity;

  @Column({ type: 'varchar', length: 50, nullable: true })
  marital_status_uuid: string;

  @ManyToOne(() => MaritalStatusEntity, { nullable: true })
  @JoinColumn({ name: 'marital_status_uuid', referencedColumnName: 'uuid' })
  marital_status: MaritalStatusEntity | null;

  @Column({ type: 'varchar', length: 100, nullable: true, collation: 'utf8mb4_unicode_ci' })
  spouse_name: string;

  @Column({ type: 'boolean', default: false })
  spouse_member: boolean;

  @Column({ type: 'int', default: 0 })
  childrens: number;

  @Column({ type: 'uuid',length: 36, nullable: true })
  country_uuid: string;


  @ManyToOne(() => CountryEntity, { nullable: true })
  @JoinColumn({ name: 'country_uuid', referencedColumnName: 'uuid' })
  country: CountryEntity | null;

  @Column({ type: 'uuid',length: 36, nullable: true })
  city_uuid: string;


  @ManyToOne(() => CityEntity, { nullable: true })
  @JoinColumn({ name: 'city_uuid', referencedColumnName: 'uuid' })
  city: CityEntity | null;

  @Column({ type: 'varchar', length: 191, nullable: true })
  town: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  longitude: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  latitude: string;

  @Column({ type: 'uuid',length: 36, nullable: true })
  formation_uuid: string;

    @ManyToOne(() => FormationEntity, { nullable: true })
  @JoinColumn({ name: 'formation_uuid', referencedColumnName: 'uuid' })
  formation: FormationEntity | null;

  @Column({ type: 'uuid',length: 36, nullable: true })
  job_uuid: string;

  @ManyToOne(() => JobEntity, { nullable: true })
  @JoinColumn({ name: 'job_uuid', referencedColumnName: 'uuid' })
  job: JobEntity | null;


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

  @Column({ type: 'uuid', length: 36, nullable: true })
  organisation_city_uuid: string;

  @ManyToOne(() => OrganisationCityEntity, { nullable: true })
  @JoinColumn({ name: 'organisation_city_uuid', referencedColumnName: 'uuid' })
  organisation_city: OrganisationCityEntity | null;

  @Column({ type: 'date', nullable: true })
  membership_date: Date;

  @Column({ type: 'boolean', default: false })
  sokahan_byakuren: boolean;

  @Column({ type: 'uuid', length: 36, nullable: true })
  department_uuid: string;

  @ManyToOne(() => DepartmentEntity, { nullable: true })
  @JoinColumn({ name: 'department_uuid', referencedColumnName: 'uuid' })
  department: DepartmentEntity | null;

  @Column({ type: 'uuid', length: 36, nullable: true })
  division_uuid: string;

  @ManyToOne(() => DivisionEntity, { nullable: true })
  @JoinColumn({ name: 'division_uuid', referencedColumnName: 'uuid' })
  division: DivisionEntity | null;

  @Column({ type: 'boolean', default: false })
  has_gohonzon: boolean;

  @Column({ type: 'varchar', nullable: true })
  date_gohonzon: string;

  @Column({ type: 'boolean', default: false })
  has_tokusso: boolean;

  @Column({ type: 'varchar', nullable: true })
  date_tokusso: string;

  @Column({ type: 'boolean', default: false })
  has_omamori: boolean;

  @Column({ type: 'varchar', nullable: true })
  date_omamori: string;

  /** Structure */
  @Column({ type: 'int', nullable: true })
  structure_id: number;

  @Column({ type: 'varchar', length: 36, nullable: true })
  structure_uuid: string;

  @ManyToOne(() => StructureEntity, { nullable: true })
  @JoinColumn({ name: 'structure_uuid', referencedColumnName: 'uuid' })
  structure: StructureEntity | null;

  @Column({ type: 'varchar', length: 36 })
  admin_uuid: string;

  @Column({ type: 'varchar', length: 36, default: 'enable' })
  status: string;

  /** Relations */
  @OneToMany(() => MemberAccessoryEntity, (ma) => ma.member)
  member_accessories: MemberAccessoryEntity[];

  @OneToMany(() => MemberResponsibilityEntity, (mr) => mr.member)
  member_responsibilities: MemberResponsibilityEntity[];

  @OneToMany(() => MemberTravelEntity, (mt) => mt.member)
  member_travels: MemberTravelEntity[];
}
