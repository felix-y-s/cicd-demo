import { Module, Global } from '@nestjs/common';
import { PrismaService } from './prisma.service.js';

/**
 * Prisma 모듈
 * - 전역 모듈로 설정하여 애플리케이션 전체에서 사용 가능
 * - PrismaService를 제공하여 데이터베이스 접근
 */
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
