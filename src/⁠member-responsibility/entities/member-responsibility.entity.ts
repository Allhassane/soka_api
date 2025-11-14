import { IsNotEmpty, IsOptional } from 'class-validator';
import { MemberEntity } from 'src/members/entities/member.entity';
import { ResponsibilityEntity } from 'src/responsibilities/entities/responsibility.entity';
import { DateTimeEntity } from 'src/shared/entities/date-time.entity';
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
} from 'typeorm';

@Entity({ name: 'member_responsibilities' })
export class MemberResponsibilityEntity extends DateTimeEntity {
  @PrimaryGeneratedColumn()
  id: number;

  //@Column({ type: 'uuid', unique: true, default: () => 'gen_random_uuid()' }) // Postgres extension pgcrypto or use uuid-ossp
  @Column({ type: 'char', length: 36, unique: true, default: () => '(UUID())' })
  uuid: string;

  @Column({ type: 'varchar', length: 36, nullable: true })
  @IsOptional()
  member_uuid?: string;

  @ManyToOne(() => MemberEntity, (member) => member.id, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'member_id', referencedColumnName: 'id' })
  member?: MemberEntity;

  @Column({ type: 'varchar', length: 36, nullable: true })
  @IsOptional()
  responsibility_uuid?: string;

  @ManyToOne(
    () => ResponsibilityEntity,
    (responsibility) => responsibility.id,
    {
      nullable: true,
      onDelete: 'SET NULL',
    },
  )
  @JoinColumn({ name: 'responsibility_id', referencedColumnName: 'id' })
  responsibility?: ResponsibilityEntity | null;

  @Column({ type: 'varchar', length: 36, nullable: false })
  @IsNotEmpty()
  priority: string;

  @Column({ type: 'varchar', length: 36, nullable: true })
  @IsOptional()
  admin_uuid?: string;
}
