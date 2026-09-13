import {
  CallHandler,
  ExecutionContext,
  Inject,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import type { LoggerService } from '@nestjs/common';
import type { Request } from 'express';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

export interface AuthenticatedRequest extends Request {
  user?: { userId?: string };
  // 전역 ExceptionFilter가 처리 소요시간을 계산할 때 사용한다 —
  // 인터셉터와 필터는 서로 다른 컴포넌트라 지역 변수를 공유할 수 없으므로
  // request 객체에 심어 전달한다.
  _startTime?: number;
}

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  constructor(
    @Inject(WINSTON_MODULE_NEST_PROVIDER)
    private readonly logger: LoggerService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const { method, url } = request;
    const userId = request.user?.userId || 'anonymous';
    const now = Date.now();
    request._startTime = now;

    this.logger.log(`📥 [${method}] ${url} - User: ${userId}`, 'HTTP');

    return next.handle().pipe(
      tap({
        next: () => {
          const statusCode = context.switchToHttp().getResponse().statusCode;
          this.logger.log(
            `📤 [${method}] ${url} ${statusCode} - ${Date.now() - now}ms - User: ${userId}`,
            'HTTP',
          );
        },
      }),
    );
  }
}
