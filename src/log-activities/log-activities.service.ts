import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LogActivity } from './entities/log-activity.entity';

@Injectable()
export class LogActivitiesService {
  constructor(
    @InjectRepository(LogActivity)
    private readonly logRepo: Repository<LogActivity>,
  ) {}

async logAction(action: string, userId?: number, details?: any) {
  const log = this.logRepo.create({
    action,
    user_id: userId ?? null,
    details: details ? JSON.stringify(details) : null,
  });

  return this.logRepo.save(log);
}
}
