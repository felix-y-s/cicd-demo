import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { of } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AuthenticatedRequest,
  LoggingInterceptor,
} from './logging.interceptor.js';

describe('LoggingInterceptor', () => {
  let interceptor: LoggingInterceptor;
  let mockLogger: {
    log: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
    debug: ReturnType<typeof vi.fn>;
  };

  // ExecutionContext 생성 헬퍼 — request 객체를 반환값으로 노출해
  // _startTime이 설정되는지 테스트에서 검증할 수 있게 한다
  const createMockContext = (
    method = 'GET',
    url = '/api/test',
    userId?: string,
  ) => {
    const request: AuthenticatedRequest = {
      method,
      url,
      user: userId ? { userId } : undefined,
    } as AuthenticatedRequest;
    const context = {
      switchToHttp: () => ({
        getRequest: () => request,
        getResponse: () => ({
          statusCode: 200,
        }),
      }),
    } as unknown as ExecutionContext;
    return { context, request };
  };

  const createMockHandler = (response?: unknown): CallHandler => ({
    handle: () => of(response ?? { data: 'ok' }),
  });

  beforeEach(() => {
    mockLogger = {
      log: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
    };

    interceptor = new LoggingInterceptor(mockLogger as never);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('요청 진입 로그', () => {
    it('요청이 들어오면 method와 url을 포함한 로그를 기록한다', () =>
      new Promise<void>((resolve) => {
        const { context } = createMockContext('POST', '/api/users');
        const handler = createMockHandler();

        interceptor.intercept(context, handler).subscribe({
          complete: () => {
            expect(mockLogger.log).toHaveBeenCalledWith(
              expect.stringContaining('POST'),
              expect.any(String),
            );
            expect(mockLogger.log).toHaveBeenCalledWith(
              expect.stringContaining('/api/users'),
              expect.any(String),
            );
            resolve();
          },
        });
      }));

    it('인증된 사용자는 userId가 로그에 포함된다', () =>
      new Promise<void>((resolve) => {
        const { context } = createMockContext('GET', '/api/me', 'user-uuid');
        const handler = createMockHandler();

        interceptor.intercept(context, handler).subscribe({
          complete: () => {
            const firstCallArg = mockLogger.log.mock.calls[0][0];
            expect(firstCallArg).toContain('user-uuid');
            resolve();
          },
        });
      }));

    it('인증되지 않은 요청은 anonymous로 기록된다', () =>
      new Promise<void>((resolve) => {
        const { context } = createMockContext('GET', '/api/public');
        const handler = createMockHandler();

        interceptor.intercept(context, handler).subscribe({
          complete: () => {
            const firstCallArg = mockLogger.log.mock.calls[0][0];
            expect(firstCallArg).toContain('anonymous');
            resolve();
          },
        });
      }));
  });

  describe('응답 성공 로그', () => {
    it('요청 완료 시 상태코드와 응답 시간을 포함한 로그를 기록한다', () =>
      new Promise<void>((resolve) => {
        const { context } = createMockContext('GET', '/api/products');
        const handler = createMockHandler();

        interceptor.intercept(context, handler).subscribe({
          complete: () => {
            expect(mockLogger.log).toHaveBeenCalledTimes(2);
            const responseLogArg = mockLogger.log.mock.calls[1][0];
            expect(responseLogArg).toContain('200');
            expect(responseLogArg).toMatch(/\d+ms/);
            resolve();
          },
        });
      }));
  });

  // 예외 발생 시 로깅 자체는 전역 ExceptionFilter가 담당하므로 여기서는
  // 검증하지 않는다. 이 인터셉터가 책임지는 것은 필터가 처리 소요시간을
  // 계산할 수 있도록 request에 시작 시각을 남겨두는 것뿐이다.
  describe('요청 시작 시각 기록', () => {
    it('request._startTime에 시작 시각을 기록한다', () =>
      new Promise<void>((resolve) => {
        const { context, request } = createMockContext(
          'GET',
          '/api/products',
        );
        const handler = createMockHandler();

        interceptor.intercept(context, handler).subscribe({
          complete: () => {
            expect(request._startTime).toEqual(expect.any(Number));
            resolve();
          },
        });
      }));
  });
});
