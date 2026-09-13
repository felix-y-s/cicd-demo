import {
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import {
  ThrottlerGuard,
  ThrottlerLimitDetail,
  ThrottlerRequest,
} from '@nestjs/throttler';
import type { Request } from 'express';

interface RequestWithUser extends Request {
  user?: { userId?: string };
}

const THROTTLE_MESSAGES: Record<string, string> = {
  short: '요청 시도 횟수가 너무 많습니다. 잠시 후 다시 시도해주세요.',
  medium: '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.',
  long: '요청 한도를 초과했습니다. 잠시 후 다시 시도해주세요.',
};

/**
 * 커스텀 Throttler 가드
 * - IP 기반 기본 추적 (인증 없는 요청)
 * - JWT userId 기반 추적 (인증된 사용자 — IP 변경에 무관하게 일관된 제한)
 * - 프로파일별 한국어 에러 메시지
 *
 * @nestjs/throttler v6부터 ThrottlerLimitDetail에 프로파일명이 포함되지
 * 않아(key는 sha256 해시), throwThrottlingException만 오버라이드해서는
 * 프로파일을 알 수 없다. handleRequest에서 throttler.name을 현재 요청의
 * 컨텍스트(WeakMap)에 임시 저장해두고 throwThrottlingException에서 읽는다.
 */
@Injectable()
export class CustomThrottlerGuard extends ThrottlerGuard {
  private readonly throttlerNameByContext = new WeakMap<
    ExecutionContext,
    string
  >();

  protected async getTracker(req: RequestWithUser): Promise<string> {
    // 프록시(로드밸런서, Nginx) 뒤에 있는 경우 실제 클라이언트 IP 추출
    // ⚠️ 보안: 클라이언트가 이 헤더를 직접 조작할 수 있으므로,
    //    Nginx에서 반드시 `proxy_set_header X-Forwarded-For $remote_addr` 로 덮어쓸 것
    const ip =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0].trim() ||
      req.ip;

    return req.user?.userId || (ip as string);
  }

  protected async handleRequest(
    requestProps: ThrottlerRequest,
  ): Promise<boolean> {
    this.throttlerNameByContext.set(
      requestProps.context,
      requestProps.throttler.name ?? 'default',
    );
    return super.handleRequest(requestProps);
  }

  protected async throwThrottlingException(
    context: ExecutionContext,
    _throttlerLimitDetail: ThrottlerLimitDetail,
  ): Promise<void> {
    const throttlerName = this.throttlerNameByContext.get(context) ?? '';
    const message =
      THROTTLE_MESSAGES[throttlerName] ||
      '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.';

    throw new HttpException(
      {
        statusCode: HttpStatus.TOO_MANY_REQUESTS,
        code: 'TOO_MANY_REQUESTS',
        message,
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}
