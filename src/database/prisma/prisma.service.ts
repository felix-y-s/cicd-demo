import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

/**
 * executeTransaction 콜백에 전달되는 트랜잭션 클라이언트 타입
 * - Prisma.TransactionClient 대신 이 타입을 써야 executeTransaction의
 *   실제 반환 타입과 어긋나지 않는다
 * - Repository 메서드가 `client: TransactionClient | PrismaService` 형태로
 *   선택적 파라미터를 받을 때(Unit of Work 패턴) 이 타입을 import해서 사용한다
 */
export type TransactionClient = Omit<
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>;

/**
 * Prisma 서비스
 * - Prisma Client 연결 관리 (Prisma 7+ + @prisma/adapter-pg)
 * - 애플리케이션 생명주기와 연동
 * - 데이터베이스 연결 풀 관리
 */
@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    // Prisma 7+: driver adapter로 PostgreSQL 직접 연결
    const adapter = new PrismaPg({
      connectionString: process.env.DATABASE_URL,
    });

    super({
      adapter,
      log: [
        { emit: 'event', level: 'query' },
        { emit: 'event', level: 'error' },
        { emit: 'event', level: 'info' },
        { emit: 'event', level: 'warn' },
      ],
      errorFormat: 'pretty',
    });

    // 쿼리 로깅 (개발/테스트 환경에서만)
    if (
      process.env.NODE_ENV === 'development' ||
      process.env.NODE_ENV === 'test'
    ) {
      this.$on('query' as never, (e: any) => {
        this.logger.debug(`Query: ${e.query}`);
        this.logger.debug(`Params: ${e.params}`);
        this.logger.debug(`Duration: ${e.duration}ms`);
      });
    }

    // 에러 로깅
    this.$on('error' as never, (e: any) => {
      this.logger.error(`Prisma Error: ${e.message}`, e.stack);
    });

    // 경고 로깅
    this.$on('warn' as never, (e: any) => {
      this.logger.warn(`Prisma Warning: ${e.message}`);
    });
  }

  /**
   * 모듈 초기화 시 데이터베이스 연결
   */
  async onModuleInit() {
    try {
      await this.$connect();
      this.logger.log('PostgreSQL 데이터베이스 연결 성공');
    } catch (error) {
      this.logger.error('PostgreSQL 데이터베이스 연결 실패', error);
      throw error;
    }
  }

  /**
   * 모듈 종료 시 데이터베이스 연결 해제
   */
  async onModuleDestroy() {
    try {
      await this.$disconnect();
      this.logger.log('PostgreSQL 데이터베이스 연결 해제');
    } catch (error) {
      this.logger.error('PostgreSQL 데이터베이스 연결 해제 실패', error);
    }
  }

  /**
   * 데이터베이스 상태 확인
   * @returns 연결 정상 여부
   */
  async healthCheck(): Promise<boolean> {
    try {
      await this.$queryRaw`SELECT 1`;
      return true;
    } catch (error) {
      this.logger.error('데이터베이스 상태 확인 실패', error);
      return false;
    }
  }

  /**
   * 트랜잭션 헬퍼
   * - 여러 테이블에 걸친 atomic write 작업에 사용
   * @param operations 트랜잭션 내에서 실행할 콜백 함수
   * @returns 콜백 함수의 반환값
   */
  async executeTransaction<T>(
    operations: (prisma: TransactionClient) => Promise<T>,
  ): Promise<T> {
    return this.$transaction(operations);
  }
}
