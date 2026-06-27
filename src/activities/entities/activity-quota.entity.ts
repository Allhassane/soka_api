import { DateTimeEntity } from 'src/shared/entities/date-time.entity';
import { StructureEntity } from 'src/structure/entities/structure.entity';
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  Unique,
  BeforeInsert,
  Index,
} from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { ActivityEntity } from './activity.entity';

@Entity({ name: 'activity_quotas' })
@Unique('uniq_activity_quota_structure', ['activity_uuid', 'structure_uuid'])
export class ActivityQuotaEntity extends DateTimeEntity {
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
  activity_uuid: string;

  @ManyToOne(() => ActivityEntity, { nullable: false, createForeignKeyConstraints: false })
  @JoinColumn({ name: 'activity_uuid', referencedColumnName: 'uuid' })
  activity: ActivityEntity;

  @Index()
  @Column({ type: 'char', length: 36 })
  structure_uuid: string;

  @ManyToOne(() => StructureEntity, { nullable: false, createForeignKeyConstraints: false })
  @JoinColumn({ name: 'structure_uuid', referencedColumnName: 'uuid' })
  structure: StructureEntity;

  @Column({ type: 'int', default: 0 })
  quota_allocated: number;

  @Column({ type: 'int', default: 0 })
  quota_used: number;

  @Column({ type: 'char', length: 36 })
  admin_uuid: string;
}
