import { DateTimeEntity } from 'src/shared/entities/date-time.entity';
import { Entity, PrimaryGeneratedColumn, Column, PrimaryColumn } from 'typeorm';

@Entity({ name: 'old_structures' })
export class StructureOldEntity extends DateTimeEntity {
  @PrimaryColumn()
  id: string;

  @Column({ nullable: true })
  name: string;

  @Column({ nullable: true })
  situation_geographique: string;

  @Column({ nullable: true })
  description: string;

  @Column({ nullable: true })
  statut: string;

  @Column({ nullable: true })
  id_niveau: string;

  @Column({ nullable: true })
  parent_id: string;
}
