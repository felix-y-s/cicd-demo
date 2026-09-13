import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ActivityLogsController } from './activity-logs.controller.js';
import { ActivityLogsService } from './activity-logs.service.js';
import { ActivityLogsRepository } from './repositories/activity-logs.repository.js';
import { ActivityLog, ActivityLogSchema } from './schemas/activity-log.schema.js';

/**
 * ActivityLogs 모듈
 *
 * MongodbModule이 헬스체크(MongodbService)를 위해 이미 같은 스키마를
 * forFeature()했지만, Mongoose는 같은 이름(ActivityLog.name)의
 * forFeature 등록을 여러 모듈에서 호출해도 동일 DI 토큰으로 병합한다 —
 * 실제 중복 컬렉션이나 충돌은 발생하지 않는다.
 */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ActivityLog.name, schema: ActivityLogSchema },
    ]),
  ],
  controllers: [ActivityLogsController],
  providers: [ActivityLogsService, ActivityLogsRepository],
  exports: [ActivityLogsService],
})
export class ActivityLogsModule {}
