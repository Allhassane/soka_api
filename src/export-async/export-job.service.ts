// src/export-job/export-job.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ExportJobEntity, ExportJobStatus } from './entities/export-job.entity';
import * as ExcelJS from 'exceljs';
import * as fs from 'fs';
import * as path from 'path';

export interface ExportJobFilters {
  search?: string;
  statuses?: ExportJobStatus[];
  type?: string;
  // Spécificité des statistiques membres (params.category) :
  // total, hommes, femmes, dept_hommes, dept_femmes, dept_jeunesse,
  // div_jeune_homme, div_jeune_femme, div_avenir.
  category?: string;
  // Sous-type des exports `transactions` : « zaimu » (dons) ou
  // « abonnement » (souscriptions), matérialisé dans le préfixe du fichier.
  source?: 'zaimu' | 'abonnement';
  dateFrom?: string; // format YYYY-MM-DD
  dateTo?: string; // format YYYY-MM-DD
  sortBy?: 'date' | 'created_at' | 'status' | 'type' | 'progress' | 'file_name';
  sortOrder?: 'ASC' | 'DESC';
}

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

  async getUserJobs(
    user_uuid: string,
    page: number = 1,
    limit: number = 20,
    filters: ExportJobFilters = {},
  ) {
    const safePage = Number.isFinite(page) && page > 0 ? Math.floor(page) : 1;
    const safeLimit =
      Number.isFinite(limit) && limit > 0 ? Math.min(Math.floor(limit), 200) : 20;
    const skip = (safePage - 1) * safeLimit;

    const qb = this.exportJobRepo
      .createQueryBuilder('job')
      .where('job.user_uuid = :user_uuid', { user_uuid });

    // Recherche plein-texte (nom de fichier ou type)
    if (filters.search && filters.search.trim()) {
      qb.andWhere('(job.file_name LIKE :search OR job.type LIKE :search)', {
        search: `%${filters.search.trim()}%`,
      });
    }

    // Statut(s) — multi-sélection
    const statuses = (filters.statuses ?? []).filter((s): s is ExportJobStatus =>
      Object.values(ExportJobStatus).includes(s as ExportJobStatus),
    );
    if (statuses.length > 0) {
      qb.andWhere('job.status IN (:...statuses)', { statuses });
    }

    // Type d'export (members | members_stats | transactions)
    if (filters.type && filters.type.trim()) {
      qb.andWhere('job.type = :type', { type: filters.type.trim() });
    }

    // Catégorie/spécificité (statistiques membres) — recoupée dans le JSON params.
    if (filters.category && filters.category.trim()) {
      qb.andWhere(
        "JSON_UNQUOTE(JSON_EXTRACT(job.params, '$.category')) = :category",
        { category: filters.category.trim() },
      );
    }

    // Sous-type des transactions : zaimu (dons) vs abonnement (souscriptions).
    // Le type résolu à la création est matérialisé en préfixe du nom de fichier
    // (`zaimu_…` / `abonnement_…`) par generateTransactionExportFileName().
    if (filters.source === 'zaimu') {
      qb.andWhere('job.file_name LIKE :zaimuPattern', {
        zaimuPattern: 'zaimu\\_%',
      });
    } else if (filters.source === 'abonnement') {
      qb.andWhere('job.file_name LIKE :abonnementPattern', {
        abonnementPattern: 'abonnement\\_%',
      });
    }

    // Plage de dates (created_at) — bornes inclusives sur la journée
    if (filters.dateFrom) {
      qb.andWhere('job.created_at >= :dateFrom', {
        dateFrom: `${filters.dateFrom} 00:00:00`,
      });
    }
    if (filters.dateTo) {
      qb.andWhere('job.created_at <= :dateTo', {
        dateTo: `${filters.dateTo} 23:59:59`,
      });
    }

    // Tri — colonne autorisée uniquement (anti-injection)
    const sortColumnMap: Record<string, string> = {
      date: 'created_at',
      created_at: 'created_at',
      status: 'status',
      type: 'type',
      progress: 'progress',
      file_name: 'file_name',
    };
    const sortColumn = sortColumnMap[filters.sortBy ?? 'date'] ?? 'created_at';
    const sortOrder =
      (filters.sortOrder ?? 'DESC').toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
    qb.orderBy(`job.${sortColumn}`, sortOrder);

    qb.skip(skip).take(safeLimit);

    const [data, total] = await qb.getManyAndCount();
    const totalPages = Math.ceil(total / safeLimit) || 1;

    return {
      data,
      meta: {
        total,
        page: safePage,
        limit: safeLimit,
        totalPages,
        hasNextPage: safePage < totalPages,
        hasPreviousPage: safePage > 1,
      },
    };
  }

  getDownloadUrl(fileName: string): string {
    return `/exports/download/${fileName}`;
  }
}
