// src/export-job/export-job.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ExportJobEntity, ExportJobStatus } from './entities/export-job.entity';
import * as ExcelJS from 'exceljs';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class ExportJobService {
  constructor(
    @InjectRepository(ExportJobEntity)
    private exportJobRepo: Repository<ExportJobEntity>,
  ) {}

  async createJob(type: string, params: any, user_uuid: string): Promise<ExportJobEntity> {
    const job = this.exportJobRepo.create({
      type,
      params,
      user_uuid,
      status: ExportJobStatus.PENDING,
    });

    return this.exportJobRepo.save(job);
  }

  async updateJobProgress(jobId: string, progress: number): Promise<void> {
    await this.exportJobRepo.update(jobId, { progress });
  }

  async updateJobStatus(jobId: string, status: ExportJobStatus, errorMessage?: string): Promise<void> {
    await this.exportJobRepo.update(jobId, {
      status,
      error_message: errorMessage || undefined
    });
  }

  async completeJob(jobId: string, filePath: string, fileName: string): Promise<void> {
    await this.exportJobRepo.update(jobId, {
      status: ExportJobStatus.COMPLETED,
      file_path: filePath,
      file_name: fileName,
      progress: 100,
    });
  }

  async getJob(jobId: string): Promise<ExportJobEntity> {
    const job = await this.exportJobRepo.findOne({ where: { uuid: jobId } });

    if (!job) {
      throw new NotFoundException('Job introuvable');
    }

    return job;
  }

  async getUserJobs(user_uuid: string, page: number = 1, limit: number = 20) {
    const skip = (page - 1) * limit;

    const [data, total] = await this.exportJobRepo.findAndCount({
      where: { user_uuid },
      order: { created_at: 'DESC' },
      take: limit,
      skip: skip,
    });

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        hasNextPage: page < Math.ceil(total / limit),
        hasPreviousPage: page > 1,
      },
    };
  }

  getDownloadUrl(fileName: string): string {
    return `/exports/download/${fileName}`;
  }
}
