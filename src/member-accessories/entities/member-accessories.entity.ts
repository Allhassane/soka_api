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

  @ApiProperty({ description: "UUID du membre (User)" })
  @Column({ type: 'uuid' })
  member_uuid: string;

  @ApiProperty({ description: "UUID de l'accessoire" })
  @Column({ type: 'uuid' })
  accessory_uuid: string;

  @ManyToOne(() => MemberEntity, (member) => member.member_accessories, {
    onDelete: 'CASCADE',
    eager: false,
  })
  @JoinColumn({ name: 'member_id', referencedColumnName: 'id' })
  member: MemberEntity;

  @ManyToOne(() => AccessoryEntity, (accessory) => accessory.member_accessories, {
    onDelete: 'CASCADE',
    eager: false,
  })
  @JoinColumn({ name: 'accessory_id', referencedColumnName: 'id' })
  accessory: AccessoryEntity;

  @BeforeInsert()
  generateUUID() {
    this.uuid = uuidv4();
  }
}
