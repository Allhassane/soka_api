import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('log_activities')
export class LogActivity {
  @PrimaryGeneratedColumn()
  id: number;


  @Column({ type: 'int', nullable: true })
  user_id?: number | null; 

  @Column({ nullable: false })
  action: string; // obligatoire

  @Column({ type: 'text', nullable: true })
  details?: string | null; 

  @CreateDateColumn()
  createdAt: Date;
}
