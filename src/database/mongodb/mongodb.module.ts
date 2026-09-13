import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import {
  ActivityLog,
  ActivityLogSchema,
} from '../../modules/activity-logs/schemas/activity-log.schema.js';
import { MongodbService } from './mongodb.service.js';

/**
 * MongoDB 연결 모듈
 * - MongooseModule.forRootAsync로 ConfigService 기반 환경변수 주입
 * - MongooseModule을 exports하여 feature 모듈에서 forFeature() 사용 가능
 * - MongodbService(연결 상태 모니터링)가 헬스체크용으로 ActivityLog 모델을
 *   주입받는다 — 실제 CRUD는 activity-logs 모듈의 Repository가 담당하고,
 *   여기서는 db.readyState 확인 목적으로만 모델을 재사용한다.
 */
@Module({
  imports: [
    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        uri: configService.get<string>('database.mongodb.uri'),
        maxPoolSize: 20,
        minPoolSize: 5,
        serverSelectionTimeoutMS: 5000,
        socketTimeoutMS: 45000,
        retryWrites: true,
        retryReads: true,
      }),
    }),
    MongooseModule.forFeature([
      { name: ActivityLog.name, schema: ActivityLogSchema },
    ]),
  ],
  providers: [MongodbService],
  exports: [MongooseModule, MongodbService], // forFeature()를 위해 MongooseModule 내보내기
})
export class MongodbModule {}
