import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { User } from '@prisma/client';
import { RedisService } from '../../database/redis/redis.service.js';
import {
  EmailAlreadyExistsException,
  InvalidCredentialsException,
  InvalidRefreshTokenException,
} from '../../common/exception/index.js';
import { UsersRepository } from '../users/repositories/users.repository.js';
import { UsersService } from '../users/users.service.js';
import { AuthService } from './auth.service.js';

describe('AuthService', () => {
  let service: AuthService;
  let usersService: { create: ReturnType<typeof vi.fn>; validateUser: ReturnType<typeof vi.fn> };
  let usersRepository: {
    findById: ReturnType<typeof vi.fn>;
    updateRefreshTokenHash: ReturnType<typeof vi.fn>;
  };
  let jwtService: { signAsync: ReturnType<typeof vi.fn> };
  let redis: { set: ReturnType<typeof vi.fn> };

  const mockUser: User = {
    id: 'user-uuid',
    email: 'test@example.com',
    passwordHash: '$2b$10$hashedpassword',
    refreshTokenHash: null,
    role: 'USER',
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
  };

  beforeEach(async () => {
    usersService = {
      create: vi.fn(),
      validateUser: vi.fn(),
    };
    usersRepository = {
      findById: vi.fn(),
      updateRefreshTokenHash: vi.fn().mockResolvedValue(mockUser),
    };
    jwtService = {
      signAsync: vi
        .fn()
        .mockResolvedValueOnce('access-token')
        .mockResolvedValueOnce('refresh-token'),
    };
    redis = { set: vi.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UsersService, useValue: usersService },
        { provide: UsersRepository, useValue: usersRepository },
        { provide: JwtService, useValue: jwtService },
        { provide: RedisService, useValue: redis },
        {
          provide: ConfigService,
          useValue: {
            get: vi.fn((key: string) => {
              const cfg: Record<string, string> = {
                'jwt.secret': 'test-secret-32-chars-minimum!!',
                'jwt.expiresIn': '15m',
                'jwt.refreshSecret': 'test-refresh-secret-32-chars-min!',
                'jwt.refreshExpiresIn': '7d',
              };
              return cfg[key];
            }),
          },
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('login', () => {
    it('이메일/비밀번호가 일치하면 토큰과 user를 반환하고 refreshTokenHash를 저장한다', async () => {
      usersService.validateUser.mockResolvedValue(mockUser);

      const result = await service.login({
        email: 'test@example.com',
        password: 'password123',
      });

      expect(result).toHaveProperty('accessToken', 'access-token');
      expect(result).toHaveProperty('refreshToken', 'refresh-token');
      expect(result.user).not.toHaveProperty('passwordHash');
      expect(result.user).not.toHaveProperty('refreshTokenHash');
      expect(usersRepository.updateRefreshTokenHash).toHaveBeenCalledWith(
        mockUser.id,
        expect.any(String),
      );
    });

    it('이메일 또는 비밀번호가 틀리면 InvalidCredentialsException을 전파한다', async () => {
      usersService.validateUser.mockRejectedValue(
        new InvalidCredentialsException(),
      );

      await expect(
        service.login({ email: 'test@example.com', password: 'wrong' }),
      ).rejects.toThrow(InvalidCredentialsException);
    });
  });

  describe('register', () => {
    it('회원가입 후 자동 로그인해 토큰을 반환한다', async () => {
      usersService.create.mockResolvedValue(mockUser);
      usersService.validateUser.mockResolvedValue(mockUser);

      const result = await service.register({
        email: 'test@example.com',
        password: 'password123',
      });

      expect(usersService.create).toHaveBeenCalledOnce();
      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');
    });

    it('이미 등록된 이메일이면 EmailAlreadyExistsException을 전파한다', async () => {
      usersService.create.mockRejectedValue(new EmailAlreadyExistsException());

      await expect(
        service.register({ email: 'test@example.com', password: 'password123' }),
      ).rejects.toThrow(EmailAlreadyExistsException);
    });
  });

  describe('토큰 payload 타입 구분', () => {
    it('access token payload에는 type: access가, refresh token에는 type: refresh가 담긴다', async () => {
      usersService.validateUser.mockResolvedValue(mockUser);

      await service.login({ email: 'test@example.com', password: 'password123' });

      expect(jwtService.signAsync).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({ type: 'access' }),
        expect.objectContaining({ expiresIn: '15m' }),
      );
      expect(jwtService.signAsync).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({ type: 'refresh' }),
        expect.objectContaining({ expiresIn: '7d' }),
      );
    });
  });

  describe('refreshAccessToken', () => {
    it('저장된 refreshTokenHash와 일치하면 새 토큰을 발급한다', async () => {
      const refreshToken = 'valid-refresh-token';
      const refreshTokenHash = await bcrypt.hash(refreshToken, 10);
      usersRepository.findById.mockResolvedValue({
        ...mockUser,
        refreshTokenHash,
      });

      const result = await service.refreshAccessToken(
        mockUser.id,
        refreshToken,
      );

      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');
    });

    it('저장된 해시가 없으면 InvalidRefreshTokenException을 던진다', async () => {
      usersRepository.findById.mockResolvedValue({
        ...mockUser,
        refreshTokenHash: null,
      });

      await expect(
        service.refreshAccessToken(mockUser.id, 'any-token'),
      ).rejects.toThrow(InvalidRefreshTokenException);
    });

    it('제시된 토큰이 저장된 해시와 다르면 InvalidRefreshTokenException을 던진다', async () => {
      const refreshTokenHash = await bcrypt.hash('other-token', 10);
      usersRepository.findById.mockResolvedValue({
        ...mockUser,
        refreshTokenHash,
      });

      await expect(
        service.refreshAccessToken(mockUser.id, 'presented-token'),
      ).rejects.toThrow(InvalidRefreshTokenException);
    });

    it('사용자가 없으면 InvalidRefreshTokenException을 던진다', async () => {
      usersRepository.findById.mockResolvedValue(null);

      await expect(
        service.refreshAccessToken('unknown-id', 'any-token'),
      ).rejects.toThrow(InvalidRefreshTokenException);
    });
  });

  describe('logout', () => {
    it('jti를 블랙리스트에 등록하고 refreshTokenHash를 null로 만든다', async () => {
      const exp = Math.floor(Date.now() / 1000) + 900; // 15분 후 만료

      await service.logout('some-jti', exp, mockUser.id);

      expect(redis.set).toHaveBeenCalledWith(
        'blacklist:some-jti',
        '1',
        expect.any(Number),
      );
      expect(usersRepository.updateRefreshTokenHash).toHaveBeenCalledWith(
        mockUser.id,
        null,
      );
    });

    it('이미 만료된 토큰(ttl<=0)이면 블랙리스트에 등록하지 않는다', async () => {
      const exp = Math.floor(Date.now() / 1000) - 10; // 이미 만료

      await service.logout('expired-jti', exp, mockUser.id);

      expect(redis.set).not.toHaveBeenCalled();
      expect(usersRepository.updateRefreshTokenHash).toHaveBeenCalledWith(
        mockUser.id,
        null,
      );
    });
  });
});
