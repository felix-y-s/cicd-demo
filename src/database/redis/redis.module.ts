import {
  Module,
  Global,
  DynamicModule,
  OnModuleDestroy,
  Inject,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';
import { REDIS_CLIENT } from './redis.constants.js';
import { RedisService } from './redis.service.js';

// 하위 호환을 위해 re-export
export { REDIS_CLIENT };

/**
 * Redis 모듈
 * 캐싱, 세션 관리, 실시간 데이터 처리에 사용
 */
@Global()
@Module({})
export class RedisModule implements OnModuleDestroy {
  // DI로 주입받아 관리 (static 멤버 금지)
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  static forRoot(): DynamicModule {
    // static 메서드에서 로깅을 위한 Logger 인스턴스 별도 생성
    const logger = new Logger(RedisModule.name);

    const redisProvider = {
      provide: REDIS_CLIENT,
      useFactory: (configService: ConfigService) => {
        const redis = new Redis({
          host: configService.get<string>('database.redis.host'),
          port: configService.get<number>('database.redis.port'),
          password: configService.get<string>('database.redis.password'),
          retryStrategy: (times: number) => {
            // 재연결 전략: 최대 10번 시도, 각 시도마다 1초씩 증가
            if (times > 10) {
              return null; // 연결 포기
            }
            return times * 1000;
          },
        });

        redis.on('connect', () => {
          logger.log('Redis 연결 성공');
        });

        redis.on('error', (err) => {
          logger.error('Redis 연결 오류', err.stack);
        });

        redis.on('end', () => {
          logger.warn('Redis 연결 종료');
        });

        return redis;
      },
      inject: [ConfigService],
    };

    return {
      module: RedisModule,
      providers: [redisProvider, RedisService],
      exports: [REDIS_CLIENT, RedisService],
    };
  }

  async onModuleDestroy() {
    // DI 인스턴스로 종료 (static 참조 금지)
    this.redis.removeAllListeners();
    await this.redis.quit();
  }
}
