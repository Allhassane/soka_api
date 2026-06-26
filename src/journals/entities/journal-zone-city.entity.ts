import { DateTimeEntity } from 'src/shared/entities/date-time.entity';
import { CityEntity } from 'src/cities/entities/city.entity';
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  BeforeInsert,
  Index,
} from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { JournalZoneEntity } from './journal-zone.entity';

/**
 * Rattachement d'une ville (référentiel `cities`) à une zone de distribution.
 * Une zone regroupe plusieurs villes ; un abonné est relié à sa zone via la
 * ville de son membre (members.city_uuid). Sert de base au calcul automatique
 * du besoin par zone à partir des abonnements.
 */
@Entity({ name: 'journal_zone_cities' })
export class JournalZoneCityEntity extends DateTimeEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'char', length: 36, unique: true })
  uuid: string;

  @BeforeInsert()
  ensureUuid() {
    this.uuid = this.uuid ?? uuidv4();
  }

  @Index()
  @Column({ type: 'char', length: 36 })
  zone_uuid: string;

  @ManyToOne(() => JournalZoneEntity, (z) => z.zoneCities, {
    nullable: false,
    createForeignKeyConstraints: false,
  })
  @JoinColumn({ name: 'zone_uuid', referencedColumnName: 'uuid' })
  zone: JournalZoneEntity;

  @Index()
  @Column({ type: 'char', length: 36 })
  city_uuid: string;

  @ManyToOne(() => CityEntity, {
    nullable: true,
    createForeignKeyConstraints: false,
  })
  @JoinColumn({ name: 'city_uuid', referencedColumnName: 'uuid' })
  city: CityEntity | null;

  @Column({ type: 'char', length: 36, nullable: true })
  admin_uuid: string;
}
