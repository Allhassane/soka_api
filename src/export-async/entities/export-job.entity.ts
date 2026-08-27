// src/export-job/entities/export-job.entity.ts
import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

/**
 * **Type des exports lancés depuis le module Comptabilité.**
 *
 * 🚨 Ces jobs sont réservés à ce module : ils n'apparaissent PAS dans la liste du module
 * Exports (`ExportJobService.getUserJobs` les exclut) et la route de téléchargement des
 * Exports les refuse. Ils se lancent et se récupèrent depuis la Comptabilité, et de là
 * seulement. Voir `accounting/accounting-export.service.ts`.
 */
export const TYPE_EXPORT_COMPTA = 'accounting_payments';

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
