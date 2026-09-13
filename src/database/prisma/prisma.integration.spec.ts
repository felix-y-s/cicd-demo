import { ConfigModule } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaModule } from './prisma.module.js';
import { PrismaService } from './prisma.service.js';

describe('PrismaService 연결 테스트', () => {
  let prisma: PrismaService;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [ConfigModule.forRoot(), PrismaModule],
    }).compile();

    prisma = module.get<PrismaService>(PrismaService);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('DB에 연결할 수 있다', async () => {
    const result =
      await prisma.$queryRaw<[{ result: number }]>`SELECT 1 AS result`;
    expect(result[0].result).toBe(1);
  });

  it('healthCheck()는 연결이 정상이면 true를 반환한다', async () => {
    const healthy = await prisma.healthCheck();
    expect(healthy).toBe(true);
  });
});
