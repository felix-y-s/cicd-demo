import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import type { Request } from 'express';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { JwtRefreshStrategy } from './jwt-refresh.strategy.js';

describe('JwtRefreshStrategy', () => {
  let strategy: JwtRefreshStrategy;

  const createMockRequest = (token?: string): Request =>
    ({
      headers: {
        authorization: token ? `Bearer ${token}` : undefined,
      },
    }) as unknown as Request;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        JwtRefreshStrategy,
        {
          provide: ConfigService,
          useValue: {
            get: vi.fn((key: string) => {
              if (key === 'jwt.refreshSecret')
                return 'test-refresh-secret-32-chars-min!';
              return undefined;
            }),
          },
        },
      ],
    }).compile();

    strategy = module.get<JwtRefreshStrategy>(JwtRefreshStrategy);
  });

  afterEach(() => vi.clearAllMocks());

  describe('validate', () => {
    it('유효한 refresh payload에서 JwtValidationResult를 반환한다 (원문 토큰 포함)', () => {
      const payload = {
        sub: 'user-uuid',
        email: 'test@example.com',
        role: 'USER',
        jti: 'token-uuid',
        exp: 1234567890,
        type: 'refresh' as const,
      };
      const req = createMockRequest('the-raw-refresh-token');

      const result = strategy.validate(req, payload);

      expect(result).toEqual({
        userId: 'user-uuid',
        email: 'test@example.com',
        role: 'USER',
        jti: 'token-uuid',
        exp: 1234567890,
        refreshToken: 'the-raw-refresh-token',
      });
    });

    it('payload.type이 access이면 UnauthorizedException을 발생시킨다', () => {
      const payload = {
        sub: 'user-uuid',
        email: 'test@example.com',
        role: 'USER',
        jti: 'token-uuid',
        exp: 1234567890,
        type: 'access' as const,
      };
      const req = createMockRequest('some-token');

      expect(() => strategy.validate(req, payload)).toThrow(
        UnauthorizedException,
      );
    });
  });
});
