import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  BeforeInsert,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { ApiProperty } from '@nestjs/swagger';
import { DateTimeEntity } from 'src/shared/entities/date-time.entity';
import { AccessoryEntity } from 'src/accessories/entities/accessory.entity'; // 
import { MemberEntity } from 'src/members/entities/member.entity';

@Entity('member_accessories')
export class MemberAccessoryEntity extends DateTimeEntity {
  @ApiProperty({ description: 'Identifiant auto-incrémenté' })
  @PrimaryGeneratedColumn()
  id: number;

  @ApiProperty({ description: 'UUID unique du lien membre/accessoire' })
  @Column({ unique: true })
  uuid: string;

  @ApiProperty({ description: "UUID du membre" })
  @Column({ type: 'varchar', length: 36 })
  member_uuid: string;

  @ApiProperty({ description: "UUID de l'accessoire" })
  @Column({ type: 'varchar', length: 36 })
  accessory_uuid: string;

  // Les liens réels sont portés par les colonnes *_uuid (member_id/accessory_id
  // historiques restaient NULL). On joint donc sur uuid, comme MemberResponsibilityEntity.
  @ManyToOne(() => MemberEntity, (member) => member.member_accessories, {
    onDelete: 'CASCADE',
    eager: false,
  })
  @JoinColumn({ name: 'member_uuid', referencedColumnName: 'uuid' })
  member: MemberEntity;

  @ManyToOne(() => AccessoryEntity, (accessory) => accessory.member_accessories, {
    onDelete: 'CASCADE',
    eager: false,
  })
  @JoinColumn({ name: 'accessory_uuid', referencedColumnName: 'uuid' })
  accessory: AccessoryEntity;

  @BeforeInsert()
  generateUUID() {
    this.uuid = uuidv4();
  }
}
