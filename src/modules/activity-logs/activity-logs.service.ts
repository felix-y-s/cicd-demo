import { Injectable } from '@nestjs/common';
import type { ActivityLog } from './schemas/activity-log.schema.js';
import { ActivityLogNotFoundException } from '../../common/exception/index.js';
import {
  PaginationUtil,
  type PaginatedResult,
  type PaginationOptions,
} from '../../common/pagination/index.js';
import { CreateActivityLogDto } from './dto/create-activity-log.dto.js';
import { ActivityLogsRepository } from './repositories/activity-logs.repository.js';

@Injectable()
export class ActivityLogsService {
  constructor(private readonly activityLogsRepository: ActivityLogsRepository) {}

  async record(
    userId: string,
    dto: CreateActivityLogDto,
  ): Promise<ActivityLog> {
    return this.activityLogsRepository.create({
      userId,
      action: dto.action,
      metadata: dto.metadata,
    });
  }

  async findByUserId(
    userId: string,
    pagination: PaginationOptions,
  ): Promise<PaginatedResult<ActivityLog>> {
    const options = PaginationUtil.normalize(pagination);
    const { skip, limit } = PaginationUtil.getMongoOptions(options);

    const { items, total } = await this.activityLogsRepository.findByUserId(
      userId,
      { skip, limit },
    );

    return PaginationUtil.paginate(items, total, options);
  }

  /**
   * @throws ActivityLogNotFoundException 존재하지 않거나 본인 소유가 아닌 경우
   *   (두 경우를 구분하지 않는다 — IDOR 방지)
   */
  async findOne(id: string, userId: string): Promise<ActivityLog> {
    const log = await this.activityLogsRepository.findByIdAndUserId(
      id,
      userId,
    );
    if (!log) {
      throw new ActivityLogNotFoundException();
    }
    return log;
  }
}
