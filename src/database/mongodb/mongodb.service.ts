import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import { ActivityLog } from '../../modules/activity-logs/schemas/activity-log.schema.js';

/**
 * MongoDB 연결 상태 관리 서비스
 * - 연결 이벤트 리스너 등록
 * - 헬스체크 제공
 *
 * @remarks
 * 실제 도메인 CRUD는 activity-logs 모듈의 Repository가 담당한다.
 * 이 서비스는 연결 상태 모니터링 역할만 한다.
 */
@Injectable()
export class MongodbService implements OnModuleInit {
  private readonly logger = new Logger(MongodbService.name);

  constructor(
    @InjectModel(ActivityLog.name)
    private readonly activityLogModel: Model<ActivityLog>,
  ) {}

  onModuleInit() {
    const db = this.activityLogModel.db;

    db.on('connected', () => {
      this.logger.log('MongoDB 연결 성공');
    });

    db.on('error', (error) => {
      this.logger.error('MongoDB 연결 에러:', error);
    });

    db.on('disconnected', () => {
      this.logger.warn('MongoDB 연결 끊김');
    });

    db.on('reconnected', () => {
      this.logger.log('MongoDB 재연결 성공');
    });

    db.on('timeout', () => {
      this.logger.error('MongoDB 연결 타임아웃 - 연결 풀이 부족할 수 있습니다');
    });
  }

  /**
   * MongoDB 연결 상태 확인
   * - 0: disconnected, 1: connected, 2: connecting, 3: disconnecting
   */
  async isConnected(): Promise<boolean> {
    try {
      return this.activityLogModel.db.readyState === 1;
    } catch {
      return false;
    }
  }
}
