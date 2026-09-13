import { UnauthorizedException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../../../database/redis/redis.service.js';
import { JwtStrategy } from './jwt.strategy.js';

describe('JwtStrategy', () => {
  let strategy: JwtStrategy;
  let redisService: { exists: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    redisService = { exists: vi.fn().mockResolvedValue(false) };

    const module = await Test.createTestingModule({
      providers: [
        JwtStrategy,
        {
          provide: ConfigService,
          useValue: {
            get: vi.fn((key: string) => {
              if (key === 'jwt.secret') return 'test-secret-32-chars-minimum!!';
              return undefined;
            }),
          },
        },
        { provide: RedisService, useValue: redisService },
      ],
    }).compile();

    strategy = module.get<JwtStrategy>(JwtStrategy);
  });

  afterEach(() => vi.clearAllMocks());

  describe('validate', () => {
    it('유효한 access payload에서 JwtValidationResult를 반환한다', async () => {
      const payload = {
        sub: 'user-uuid',
        email: 'test@example.com',
        role: 'USER',
        jti: 'token-uuid',
        exp: 1234567890,
        type: 'access' as const,
      };

      const result = await strategy.validate(payload);

      expect(result).toEqual({
        userId: 'user-uuid',
        email: 'test@example.com',
        role: 'USER',
        jti: 'token-uuid',
        exp: 1234567890,
      });
    });

    it('payload.type이 refresh이면 UnauthorizedException을 발생시킨다', async () => {
      const payload = {
        sub: 'user-uuid',
        email: 'test@example.com',
        role: 'USER',
        jti: 'token-uuid',
        exp: 1234567890,
        type: 'refresh' as const,
      };

      await expect(strategy.validate(payload)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('필수 필드(sub, email, role)가 없으면 UnauthorizedException을 발생시킨다', async () => {
      const incompletePayload = {
        sub: '',
        email: '',
        role: '',
        jti: '',
        exp: 0,
        type: 'access' as const,
      };

      await expect(strategy.validate(incompletePayload)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('블랙리스트에 등록된 jti는 UnauthorizedException을 발생시킨다', async () => {
      redisService.exists.mockResolvedValue(true);
      const payload = {
        sub: 'user-uuid',
        email: 'test@example.com',
        role: 'USER',
        jti: 'blacklisted-jti',
        exp: 1234567890,
        type: 'access' as const,
      };

      await expect(strategy.validate(payload)).rejects.toThrow(
        UnauthorizedException,
      );
      expect(redisService.exists).toHaveBeenCalledWith(
        'blacklist:blacklisted-jti',
      );
    });
  });
});
