import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { createObserveModule } from '@nestjs/observe';
import { ThrottlerModule } from '@nestjs/throttler';
import { ThrottlerStorageRedisService } from '@nest-lab/throttler-storage-redis';
import type { Redis } from 'ioredis';
import { WinstonModule } from 'nest-winston';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { EventsModule } from './common/events/events.module.js';
import { HttpExceptionFilter } from './common/response-format/http-exception.filter.js';
import { TransformInterceptor } from './common/response-format/transform.interceptor.js';
import { CustomThrottlerGuard } from './common/throttler/custom-throttler.guard.js';
import { MongodbModule } from './database/mongodb/mongodb.module.js';
import { PrismaModule } from './database/prisma/prisma.module.js';
import { RedisModule } from './database/redis/redis.module.js';
import { REDIS_CLIENT } from './database/redis/redis.constants.js';
import { ActivityLogsModule } from './modules/activity-logs/activity-logs.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { JwtAuthGuard } from './modules/auth/guards/jwt-auth.guard.js';
import { PostsModule } from './modules/posts/posts.module.js';
import { UsersModule } from './modules/users/users.module.js';
import { RabbitMQModule } from './rabbitmq/rabbitmq.module.js';
import configuration from './config/configuration.js';
import { winstonConfig } from './config/logger.config.js';
import { validationSchema } from './config/validation.schema.js';

export const { ObserveModule, ObserveInstrument } = createObserveModule();

@Module({
  imports: [
    // 환경변수 구조화 및 앱 기동 시 joi 검증 — isGlobal로 전역에서 ConfigService 주입 가능
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      validationSchema,
      validationOptions: {
        // joi 전용 옵션(allowUnknown, abortEarly)은 @nestjs/config v12부터
        // Standard Schema 대응을 위해 libraryOptions 하위로 이동됨
        libraryOptions: {
          allowUnknown: true,
          abortEarly: false,
        },
      },
      envFilePath:
        process.env.NODE_ENV === 'test'
          ? ['.env.test', '.env']
          : ['.env'],
      expandVariables: true,
    }),
    // Winston 전역 로거 — WINSTON_MODULE_NEST_PROVIDER 토큰으로 어디서든 주입 가능
    WinstonModule.forRoot(winstonConfig),
    // MongoDB 연결 — feature 모듈은 MongooseModule.forFeature()로 스키마 등록
    MongodbModule,
    // PostgreSQL(Prisma) 연결 — @Global()이므로 다른 모듈에서 재등록 불필요
    PrismaModule,
    // 사용자 데이터 관리(UsersRepository) — AuthModule이 이 모듈을 import해 주입받음
    UsersModule,
    // JWT 인증/인가 — 회원가입/로그인/재발급/로그아웃, 전역 JwtAuthGuard가 사용하는 전략도 여기서 등록
    AuthModule,
    // 게시글 CRUD 예시 도메인 (Prisma) — 생성 시 post.created 이벤트 발행/구독까지 연결
    PostsModule,
    // 사용자 활동 로그 기록 예시 도메인 (MongoDB)
    ActivityLogsModule,
    // Redis 연결 — refresh token 저장, 블랙리스트, Throttler 저장소 등에 사용
    RedisModule.forRoot(),
    // RabbitMQ 연결(채널 풀, 공통 Exchange 설정)
    RabbitMQModule,
    // EventPublisherService + 로컬 EventEmitter 글로벌 설정 — emitLocal/emitDistributed/emitAll 제공
    EventsModule,
    // Rate Limiting — 3단계 프로파일(short/medium/long), Redis 저장소로 다중 인스턴스 공유
    // RedisModule은 위에서 이미 등록됐고 @Global()이므로 여기서는 imports
    // 없이 REDIS_CLIENT를 주입받을 수 있다 — forRoot()를 다시 호출하면
    // 두 번째 Redis 연결이 생기므로 반드시 재사용한다.
    ThrottlerModule.forRootAsync({
      imports: [],
      inject: [ConfigService, REDIS_CLIENT],
      useFactory: (configService: ConfigService, redisClient: Redis) => ({
        throttlers: [
          {
            name: 'short',
            ttl: configService.get<number>('throttle.shortTtl') as number,
            limit: configService.get<number>('throttle.shortLimit') as number,
          },
          {
            name: 'medium',
            ttl: configService.get<number>('throttle.mediumTtl') as number,
            limit: configService.get<number>(
              'throttle.mediumLimit',
            ) as number,
          },
          {
            name: 'long',
            ttl: configService.get<number>('throttle.longTtl') as number,
            limit: configService.get<number>('throttle.longLimit') as number,
          },
        ],
        storage: new ThrottlerStorageRedisService(redisClient),
      }),
    }),
    // Distributed tracing, auto-correlated logs, request/job metrics, error
    // telemetry, alarms, and more — out of the box. Sign up at https://observe.nestjs.com
    ObserveModule.forRoot({
      appKey: 'YOUR_APP_KEY',
      appSecret: 'YOUR_APP_SECRET',
      serviceId: 'nest-template',
    }),
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard, // 전역 적용 — @Public()으로 개별 제외 가능
    },
    {
      provide: APP_GUARD,
      useClass: CustomThrottlerGuard, // JwtAuthGuard 다음에 실행 — req.user 사용 가능
    },
    {
      // 모든 성공 응답을 { success, statusCode, data, timestamp, path }로 통일
      provide: APP_INTERCEPTOR,
      useClass: TransformInterceptor,
    },
    {
      // 모든 예외를 { success: false, statusCode, code, ... }로 통일 (main.ts의 useGlobalFilters 대체)
      provide: APP_FILTER,
      useClass: HttpExceptionFilter,
    },
  ],
})
export class AppModule {}
