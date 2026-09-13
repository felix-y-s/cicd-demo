import { ConfigModule } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { PrismaModule } from '../../../database/prisma/prisma.module.js';
import { PrismaService } from '../../../database/prisma/prisma.service.js';
import { UsersRepository } from './users.repository.js';

describe('UsersRepository 통합 테스트', () => {
  let repository: UsersRepository;
  let prisma: PrismaService;
  let testRecordId: string | undefined;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [ConfigModule.forRoot(), PrismaModule],
      providers: [UsersRepository],
    }).compile();

    repository = module.get<UsersRepository>(UsersRepository);
    prisma = module.get<PrismaService>(PrismaService);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  afterEach(async () => {
    if (testRecordId) {
      await prisma.user.deleteMany({ where: { id: testRecordId } });
      testRecordId = undefined;
    }
  });

  describe('create', () => {
    it('DB에 저장하고 생성된 객체를 반환한다', async () => {
      const data = {
        email: `test-${Date.now()}@example.com`,
        passwordHash: 'hashed-password',
      };

      const result = await repository.create(data);
      testRecordId = result.id;

      expect(result.id).toBeDefined();
      expect(result.email).toBe(data.email);

      const saved = await prisma.user.findUnique({
        where: { id: result.id },
      });
      expect(saved).not.toBeNull();
    });
  });

  describe('findById', () => {
    it('존재하는 ID로 조회 시 레코드를 반환한다', async () => {
      const created = await repository.create({
        email: `test-${Date.now()}@example.com`,
        passwordHash: 'hashed-password',
      });
      testRecordId = created.id;

      const result = await repository.findById(created.id);

      expect(result).not.toBeNull();
      expect(result?.id).toBe(created.id);
    });

    it('존재하지 않는 ID로 조회 시 null을 반환한다', async () => {
      const result = await repository.findById(
        '00000000-0000-0000-0000-000000000000',
      );
      expect(result).toBeNull();
    });
  });

  describe('findByEmail', () => {
    it('존재하는 이메일로 조회 시 레코드를 반환한다', async () => {
      const email = `test-${Date.now()}@example.com`;
      const created = await repository.create({
        email,
        passwordHash: 'hashed-password',
      });
      testRecordId = created.id;

      const result = await repository.findByEmail(email);

      expect(result?.id).toBe(created.id);
    });
  });

  describe('updateRefreshTokenHash', () => {
    it('refreshTokenHash를 갱신한다', async () => {
      const created = await repository.create({
        email: `test-${Date.now()}@example.com`,
        passwordHash: 'hashed-password',
      });
      testRecordId = created.id;

      const updated = await repository.updateRefreshTokenHash(
        created.id,
        'new-refresh-hash',
      );

      expect(updated.refreshTokenHash).toBe('new-refresh-hash');
    });
  });
});
