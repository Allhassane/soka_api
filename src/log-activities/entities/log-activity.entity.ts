import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('log_activities')
export class LogActivity {
  @PrimaryGeneratedColumn()
  id: number;


  @Column({ type: 'int', nullable: true })
  user_id?: number | null; 

  @Column({ nullable: false, collation: 'utf8mb4_unicode_ci' })
  action: string; // obligatoire

  @Column({ type: 'text', nullable: true, collation: 'utf8mb4_unicode_ci' })
  details?: string | null; 

  @CreateDateColumn()
  createdAt: Date;
}
