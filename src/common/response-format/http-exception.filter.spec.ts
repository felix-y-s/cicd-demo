import type { ArgumentsHost } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { InvalidCredentialsException } from '../exception/index.js';
import { HttpExceptionFilter } from './http-exception.filter.js';

describe('HttpExceptionFilter', () => {
  let filter: HttpExceptionFilter;
  let mockLogger: {
    log: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
    debug: ReturnType<typeof vi.fn>;
  };
  let mockResponse: { status: ReturnType<typeof vi.fn>; json: ReturnType<typeof vi.fn> };

  // ArgumentsHost 생성 헬퍼 — response의 status/json 호출 여부를
  // 테스트에서 검증할 수 있도록 mockResponse를 클로저 밖에 노출한다
  const createMockHost = (
    method = 'POST',
    url = '/api/auth/login',
    userId?: string,
    startTime?: number,
    path = '/auth/login',
  ): ArgumentsHost => {
    mockResponse = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    };
    return {
      switchToHttp: () => ({
        getRequest: () => ({
          method,
          url,
          path,
          user: userId ? { userId } : undefined,
          _startTime: startTime,
        }),
        getResponse: () => mockResponse,
      }),
    } as unknown as ArgumentsHost;
  };

  beforeEach(() => {
    mockLogger = {
      log: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
    };
    filter = new HttpExceptionFilter(mockLogger as never);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('응답 스키마 변환', () => {
    it('커스텀 예외의 code와 부가 정보를 응답 바디에 포함한다', () => {
      const host = createMockHost();

      filter.catch(new InvalidCredentialsException(), host);

      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          statusCode: 401,
          code: 'INVALID_CREDENTIALS',
          timestamp: expect.any(String),
          path: '/auth/login',
        }),
      );
    });

    it('예상하지 못한 예외는 500과 일반화된 메시지로 응답한다', () => {
      const host = createMockHost();

      filter.catch(new Error('DB connection lost'), host);

      expect(mockResponse.status).toHaveBeenCalledWith(500);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          statusCode: 500,
          code: 'INTERNAL_SERVER_ERROR',
          message: '서버 오류가 발생했습니다',
        }),
      );
      // 내부 에러 메시지가 클라이언트에 그대로 노출되면 안 된다
      expect(mockResponse.json).not.toHaveBeenCalledWith(
        expect.objectContaining({ message: 'DB connection lost' }),
      );
    });
  });

  describe('로그 레벨 구분', () => {
    it('4xx 예외는 warn 레벨로 기록한다', () => {
      const host = createMockHost();

      filter.catch(new InvalidCredentialsException(), host);

      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('401'),
        expect.any(String),
      );
      expect(mockLogger.error).not.toHaveBeenCalled();
    });

    it('예상하지 못한 예외(5xx)는 error 레벨로 스택과 함께 기록한다', () => {
      const host = createMockHost();
      const error = new Error('Unexpected');

      filter.catch(error, host);

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('500'),
        error.stack,
        expect.any(String),
      );
      expect(mockLogger.warn).not.toHaveBeenCalled();
    });
  });

  describe('로그 내용', () => {
    it('로그에 method, url, 상태코드, 처리 시간, userId가 포함된다', () => {
      const startTime = Date.now() - 42;
      const host = createMockHost(
        'POST',
        '/api/auth/login',
        'user-uuid',
        startTime,
      );

      filter.catch(new InvalidCredentialsException(), host);

      const logArg = mockLogger.warn.mock.calls[0][0];
      expect(logArg).toContain('POST');
      expect(logArg).toContain('/api/auth/login');
      expect(logArg).toContain('401');
      expect(logArg).toMatch(/\d+ms/);
      expect(logArg).toContain('user-uuid');
    });

    it('인증되지 않은 요청은 anonymous로 기록된다', () => {
      const host = createMockHost('POST', '/api/auth/login');

      filter.catch(new InvalidCredentialsException(), host);

      const logArg = mockLogger.warn.mock.calls[0][0];
      expect(logArg).toContain('anonymous');
    });

    it('_startTime이 없어도 에러 없이 처리한다', () => {
      const host = createMockHost('POST', '/api/auth/login');

      expect(() =>
        filter.catch(new InvalidCredentialsException(), host),
      ).not.toThrow();
      const logArg = mockLogger.warn.mock.calls[0][0];
      expect(logArg).toContain('n/a');
    });
  });

  describe('Prisma 에러 처리', () => {
    it('P2002(유니크 제약 위반)는 409와 필드명을 포함한 메시지로 응답한다', () => {
      const host = createMockHost();
      const error = new Prisma.PrismaClientKnownRequestError(
        'Unique constraint failed',
        {
          code: 'P2002',
          clientVersion: '7.10.0',
          meta: { target: ['email'] },
        },
      );

      filter.catch(error, host);

      expect(mockResponse.status).toHaveBeenCalledWith(409);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          code: 'P2002',
          message: expect.stringContaining('email'),
        }),
      );
    });

    it('meta.target이 배열이 아니어도(문자열/undefined) 에러 없이 처리한다', () => {
      const host = createMockHost();
      const error = new Prisma.PrismaClientKnownRequestError(
        'Unique constraint failed',
        {
          code: 'P2002',
          clientVersion: '7.10.0',
          meta: { target: 'users_email_key' },
        },
      );

      expect(() => filter.catch(error, host)).not.toThrow();
    });

    it('P2025(레코드 없음)는 404로 응답한다', () => {
      const host = createMockHost();
      const error = new Prisma.PrismaClientKnownRequestError(
        'Record not found',
        {
          code: 'P2025',
          clientVersion: '7.10.0',
        },
      );

      filter.catch(error, host);

      expect(mockResponse.status).toHaveBeenCalledWith(404);
    });

    it('PrismaClientValidationError는 400과 고정 메시지로 응답하고 원본 메시지를 노출하지 않는다', () => {
      const host = createMockHost();
      const error = new Prisma.PrismaClientValidationError(
        'Argument name is missing',
        { clientVersion: '7.10.0' },
      );

      filter.catch(error, host);

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({ message: '데이터 유효성 검사 실패' }),
      );
      expect(mockResponse.json).not.toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining('Argument'),
        }),
      );
    });
  });
});
