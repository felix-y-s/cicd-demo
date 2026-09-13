import { Test, TestingModule } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ActivityLogNotFoundException } from '../../common/exception/index.js';
import type { ActivityLog } from './schemas/activity-log.schema.js';
import { ActivityLogsRepository } from './repositories/activity-logs.repository.js';
import { ActivityLogsService } from './activity-logs.service.js';

describe('ActivityLogsService', () => {
  let service: ActivityLogsService;
  let repository: {
    create: ReturnType<typeof vi.fn>;
    findByIdAndUserId: ReturnType<typeof vi.fn>;
    findByUserId: ReturnType<typeof vi.fn>;
  };

  const mockLog = {
    id: 'log-1',
    userId: 'user-1',
    action: 'post.created',
    metadata: { postId: 'post-1' },
    createdAt: new Date(),
  } as unknown as ActivityLog;

  beforeEach(async () => {
    repository = {
      create: vi.fn(),
      findByIdAndUserId: vi.fn(),
      findByUserId: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ActivityLogsService,
        { provide: ActivityLogsRepository, useValue: repository },
      ],
    }).compile();

    service = module.get<ActivityLogsService>(ActivityLogsService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('findOne', () => {
    it('본인 소유의 로그면 반환한다', async () => {
      repository.findByIdAndUserId.mockResolvedValue(mockLog);

      const result = await service.findOne('log-1', 'user-1');

      expect(repository.findByIdAndUserId).toHaveBeenCalledWith(
        'log-1',
        'user-1',
      );
      expect(result).toEqual(mockLog);
    });

    it('다른 사용자의 로그를 조회하면 ActivityLogNotFoundException을 던진다 (IDOR 방지)', async () => {
      // Repository는 소유권이 없으면 존재 여부와 무관하게 null을 반환한다 —
      // 서비스는 그 결과를 "없음"과 동일하게 취급해야 한다.
      repository.findByIdAndUserId.mockResolvedValue(null);

      await expect(
        service.findOne('other-users-log-id', 'attacker-user-id'),
      ).rejects.toThrow(ActivityLogNotFoundException);
    });

    it('존재하지 않는 ID를 조회하면 ActivityLogNotFoundException을 던진다', async () => {
      repository.findByIdAndUserId.mockResolvedValue(null);

      await expect(
        service.findOne('non-existent-id', 'user-1'),
      ).rejects.toThrow(ActivityLogNotFoundException);
    });
  });
});
