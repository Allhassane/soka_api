import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  BeforeInsert,
  BeforeUpdate,
  OneToMany,
  ManyToOne,
  JoinColumn,
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

  @Column({ type: 'varchar', length: 100 })
  firstname: string;

  @Column({ type: 'varchar', length: 100 })
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
  marital_status: MaritalStatusEntity;

  @Column({ type: 'varchar', length: 100, nullable: true })
  spouse_name: string;

  @Column({ type: 'boolean', default: false })
  spouse_member: boolean;

  @Column({ type: 'int', default: 0 })
  childrens: number;

  @Column({ type: 'uuid', nullable: true })
  country_uuid: string;


  @ManyToOne(() => CountryEntity, { nullable: true })
  @JoinColumn({ name: 'country_uuid', referencedColumnName: 'uuid' })
  country: CountryEntity;

  @Column({ type: 'uuid', nullable: true })
  city_uuid: string;


  @ManyToOne(() => CityEntity, { nullable: true })
  @JoinColumn({ name: 'city_uuid', referencedColumnName: 'uuid' })
  city: CityEntity;

  @Column({ type: 'varchar', length: 191, nullable: true })
  town: string;

  @Column({ type: 'uuid', nullable: true })
  formation_uuid: string;

    @ManyToOne(() => FormationEntity, { nullable: true })
  @JoinColumn({ name: 'formation_uuid', referencedColumnName: 'uuid' })
  formation: FormationEntity;

  @Column({ type: 'uuid', nullable: true })
  job_uuid: string;

  @ManyToOne(() => JobEntity, { nullable: true })
  @JoinColumn({ name: 'job_uuid', referencedColumnName: 'uuid' })
  job: JobEntity;


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

  @ManyToOne(() => OrganisationCityEntity, { nullable: true })
  @JoinColumn({ name: 'organisation_city_uuid', referencedColumnName: 'uuid' })
  organisation_city: OrganisationCityEntity;

  @Column({ type: 'date', nullable: true })
  membership_date: Date;

  @Column({ type: 'boolean', default: false })
  sokahan_byakuren: boolean;

  @Column({ type: 'uuid', nullable: true })
  department_uuid: string;

  @ManyToOne(() => DepartmentEntity, { nullable: true })
  @JoinColumn({ name: 'department_uuid', referencedColumnName: 'uuid' })
  department: DepartmentEntity;

  @Column({ type: 'uuid', nullable: true })
  division_uuid: string;

  @ManyToOne(() => DivisionEntity, { nullable: true })
  @JoinColumn({ name: 'division_uuid', referencedColumnName: 'uuid' })
  division: DivisionEntity;

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

  @ManyToOne(() => StructureEntity, { nullable: true })
  @JoinColumn({ name: 'structure_uuid', referencedColumnName: 'uuid' })
  structure: StructureEntity;

  @Column({ type: 'varchar', length: 36 })
  admin_uuid: string;

  @Column({ type: 'varchar', length: 36, default: 'enable' })
  status: string;

  /** Relations */
  @OneToMany(() => MemberAccessoryEntity, (ma) => ma.member)
  member_accessories: MemberAccessoryEntity[];

  @OneToMany(() => MemberResponsibilityEntity, (mr) => mr.member)
  member_responsibilities: MemberResponsibilityEntity[];
}
