import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  BeforeInsert,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { DateTimeEntity } from 'src/shared/entities/date-time.entity';
import { CountryEntity } from 'src/countries/entities/country.entity';
import { MemberEntity } from 'src/members/entities/member.entity';
import { v4 as uuid } from 'uuid';

@Entity({ name: 'member_travels' })
export class MemberTravelEntity extends DateTimeEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'char', length: 36 })
  uuid: string;

  @BeforeInsert()
  setUuid() {
    this.uuid = uuid()
  }

  @Column({ type: 'varchar', length: 50})
  member_uuid: string;

  @ManyToOne(() => MemberEntity, (m) => m.member_travels, { onDelete: 'CASCADE', onUpdate: 'CASCADE' })
  @JoinColumn({ name: 'member_uuid', referencedColumnName: 'uuid' })
  member: MemberEntity;

  @Column({ type: 'varchar', length: 50})
  country_uuid: string;

  @ManyToOne(() => CountryEntity)
  @JoinColumn({ name: 'country_uuid', referencedColumnName: 'uuid' })
  country: CountryEntity;

  @Column({ type: 'date', nullable: true })
  traveled_at?: Date;

  @Column({ type: 'varchar', length: 255, nullable: true })
  about?: string;

  @Column({ type: 'varchar', length: 36, nullable: true })
  admin_uuid?: string;
}
