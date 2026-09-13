import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import { ActivityLog } from '../schemas/activity-log.schema.js';

export interface CreateActivityLogInput {
  userId: string;
  action: string;
  metadata?: Record<string, unknown>;
}

@Injectable()
export class ActivityLogsRepository {
  constructor(
    @InjectModel(ActivityLog.name)
    private readonly activityLogModel: Model<ActivityLog>,
  ) {}

  async create(data: CreateActivityLogInput): Promise<ActivityLog> {
    const created = await this.activityLogModel.create(data);
    return created.toObject();
  }

  /**
   * userId로 소유권을 함께 검증하며 단건 조회한다.
   * 다른 사용자의 로그이거나 존재하지 않는 ID는 동일하게 null을 반환해,
   * 호출부가 "존재는 하지만 남의 것"과 "아예 없음"을 구분해 응답하지
   * 않도록 한다 (IDOR 방지).
   */
  async findByIdAndUserId(
    id: string,
    userId: string,
  ): Promise<ActivityLog | null> {
    return this.activityLogModel.findOne({ _id: id, userId }).lean().exec();
  }

  /**
   * userId로 활동 로그 목록 조회 (최신순, 페이지네이션)
   * userId + createdAt 복합 인덱스를 그대로 활용한다.
   */
  async findByUserId(
    userId: string,
    params: { skip: number; limit: number },
  ): Promise<{ items: ActivityLog[]; total: number }> {
    const filter = { userId };

    const [items, total] = await Promise.all([
      this.activityLogModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip(params.skip)
        .limit(params.limit)
        .lean()
        .exec(),
      this.activityLogModel.countDocuments(filter).exec(),
    ]);

    return { items, total };
  }
}
