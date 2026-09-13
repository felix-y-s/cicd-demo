import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request, Response as ExpressResponse } from 'express';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { SKIP_TRANSFORM_KEY } from './skip-transform.decorator.js';
import type { Response } from './response.types.js';

/**
 * 모든 성공 응답을 { success, statusCode, data, timestamp, path } 형태로 통일한다.
 * @SkipTransform()이 붙은 핸들러는 원본 응답을 그대로 반환한다.
 */
@Injectable()
export class TransformInterceptor<T>
  implements NestInterceptor<T, Response<T> | T>
{
  constructor(private readonly reflector: Reflector) {}

  intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<Response<T> | T> {
    const skip = this.reflector.getAllAndOverride<boolean>(
      SKIP_TRANSFORM_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (skip) {
      return next.handle();
    }

    return next.handle().pipe(
      map((data) => {
        const response = context.switchToHttp().getResponse<ExpressResponse>();

        // 204는 바디가 없어야 하는 응답이다 — 래핑하면 빈 바디 규약이 깨진다.
        if (response.statusCode === 204) {
          return data;
        }

        const request = context.switchToHttp().getRequest<Request>();

        return {
          success: true,
          statusCode: response.statusCode,
          data,
          timestamp: new Date().toISOString(),
          path: request.path,
        };
      }),
    );
  }
}
