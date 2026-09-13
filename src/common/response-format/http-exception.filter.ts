import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Inject,
} from '@nestjs/common';
import type { LoggerService } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Response } from 'express';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import type { AuthenticatedRequest } from '../logging/logging.interceptor.js';

interface ErrorResponseBody {
  success: false;
  statusCode: number;
  code: string;
  message?: string;
  timestamp: string;
  path: string;
  [key: string]: unknown;
}

/**
 * 모든 예외를 가로채 일관된 응답 스키마로 변환한다.
 * 로깅은 이 필터가 전담한다 — LoggingInterceptor는 정상 응답만 로깅하므로
 * 여기서 로깅하지 않으면 예외가 발생했을 때 아무 기록도 남지 않는다.
 *
 * PrismaClientKnownRequestError/PrismaClientValidationError는
 * HttpException을 상속하지 않으므로 별도 분기로 상태 코드와 안전한
 * 메시지로 변환한다 (P2002 → 409, P2025 → 404 등).
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  constructor(
    @Inject(WINSTON_MODULE_NEST_PROVIDER)
    private readonly logger: LoggerService,
  ) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const request = ctx.getRequest<AuthenticatedRequest>();
    const response = ctx.getResponse<Response>();

    const status = this.resolveStatus(exception);
    const body = this.buildResponseBody(exception, status, request.path);

    this.log(exception, request, status);

    response.status(status).json(body);
  }

  private resolveStatus(exception: unknown): number {
    if (exception instanceof HttpException) {
      return exception.getStatus();
    }
    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      return this.resolvePrismaStatus(exception.code);
    }
    if (exception instanceof Prisma.PrismaClientValidationError) {
      return HttpStatus.BAD_REQUEST;
    }
    return HttpStatus.INTERNAL_SERVER_ERROR;
  }

  private buildResponseBody(
    exception: unknown,
    status: number,
    path: string,
  ): ErrorResponseBody {
    const timestamp = new Date().toISOString();

    if (exception instanceof HttpException) {
      const raw = exception.getResponse();
      // 커스텀 예외(domain-exceptions.ts)는 { code, ...부가정보 } 객체를
      // getResponse()로 그대로 반환하므로 이를 펼쳐 응답 스키마에 합친다.
      const detail =
        typeof raw === 'object' && raw !== null
          ? (raw as Record<string, unknown>)
          : { message: raw };

      return {
        success: false,
        statusCode: status,
        code: 'code' in detail ? String(detail.code) : exception.name,
        ...detail,
        timestamp,
        path,
      };
    }

    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      return {
        success: false,
        statusCode: status,
        code: exception.code, // 'P2002' 등 — Prisma 자체 에러 코드는 노출해도 안전
        message: this.resolvePrismaMessage(exception),
        timestamp,
        path,
      };
    }

    if (exception instanceof Prisma.PrismaClientValidationError) {
      return {
        success: false,
        statusCode: status,
        code: 'PRISMA_VALIDATION_ERROR',
        message: '데이터 유효성 검사 실패',
        timestamp,
        path,
      };
    }

    // 예상하지 못한 예외(DB 드라이버 오류 등) — 내부 정보를 노출하지 않는다.
    return {
      success: false,
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      code: 'INTERNAL_SERVER_ERROR',
      message: '서버 오류가 발생했습니다',
      timestamp,
      path,
    };
  }

  private resolvePrismaStatus(code: string): number {
    switch (code) {
      case 'P2002': // 고유 제약 조건 위반
        return HttpStatus.CONFLICT;
      case 'P2025': // 레코드를 찾을 수 없음
        return HttpStatus.NOT_FOUND;
      case 'P2003': // 외래 키 제약 조건 위반
      case 'P2011': // 필수 필드 누락
      case 'P2006': // 데이터 형식 오류
        return HttpStatus.BAD_REQUEST;
      case 'P1001': // DB 연결 실패
      case 'P1002':
        return HttpStatus.SERVICE_UNAVAILABLE;
      default:
        return HttpStatus.INTERNAL_SERVER_ERROR;
    }
  }

  private resolvePrismaMessage(
    error: Prisma.PrismaClientKnownRequestError,
  ): string {
    switch (error.code) {
      case 'P2002':
        return `${this.extractUniqueTarget(error)} 필드가 이미 존재합니다`;
      case 'P2025':
        return '요청한 리소스를 찾을 수 없습니다';
      case 'P2003':
        return '참조된 리소스가 존재하지 않습니다';
      case 'P2011':
        return '필수 필드가 누락되었습니다';
      case 'P2006':
        return '잘못된 데이터 형식입니다';
      case 'P1001':
      case 'P1002':
        return '데이터베이스 연결에 실패했습니다';
      default:
        return '데이터베이스 오류가 발생했습니다';
    }
  }

  /**
   * Prisma 7+의 driver adapter 파이프라인에서는 P2002의 meta.target이
   * 항상 string[]이 아니다 — named constraint 이름(string)이거나
   * 파싱 실패 시 undefined일 수 있어 타입을 분기해 방어한다.
   */
  private extractUniqueTarget(
    error: Prisma.PrismaClientKnownRequestError,
  ): string {
    const target = error.meta?.target;
    if (Array.isArray(target)) return target.join(', ');
    if (typeof target === 'string') return target;
    return '해당';
  }

  private log(
    exception: unknown,
    request: AuthenticatedRequest,
    status: number,
  ): void {
    const { method, url } = request;
    const userId = request.user?.userId || 'anonymous';
    const elapsed = request._startTime
      ? Date.now() - request._startTime
      : undefined;
    const elapsedLabel = elapsed !== undefined ? `${elapsed}ms` : 'n/a';
    const stack = exception instanceof Error ? exception.stack : undefined;

    // 4xx는 예상된 비즈니스 흐름(자격증명 불일치 등)이므로 warn,
    // 5xx는 예상하지 못한 서버 오류이므로 error로 구분한다.
    const message = `[${method}] ${url} ${status} - ${elapsedLabel} - User: ${userId}`;
    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(message, stack, 'HTTP');
    } else {
      this.logger.warn(message, 'HTTP');
    }
  }
}
