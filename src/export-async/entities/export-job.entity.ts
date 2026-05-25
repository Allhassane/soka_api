// src/export-job/entities/export-job.entity.ts
import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

export enum ExportJobStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
}

@Entity('export_jobs')
export class ExportJobEntity {
  @PrimaryGeneratedColumn('uuid')
  uuid: string;

  @Column()
  type: string; // 'transactions', 'members', etc.

  @Column({ type: 'json', nullable: true })
  params: any;

  @Column({ type: 'enum', enum: ExportJobStatus, default: ExportJobStatus.PENDING })
  status: ExportJobStatus;

  @Column({ type: 'int', default: 0 })
  progress: number;

  @Column({ nullable: true })
  file_path: string;

  @Column({ nullable: true })
  file_name: string;

  @Column({ nullable: true })
  error_message: string;

  @Column()
  user_uuid: string;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
