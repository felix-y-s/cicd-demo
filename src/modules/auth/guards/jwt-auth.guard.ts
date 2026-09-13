import {
  Injectable,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import type { Observable } from 'rxjs';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  // 요청이 Guard에 도달했을 때 (가장 먼저) - 인증 절차를 탈지 말지 라우팅 결정
  canActivate(
    context: ExecutionContext,
  ): boolean | Promise<boolean> | Observable<boolean> {
    // @Public() 데코레이터가 있으면 인증 없이 통과
    const isPublic = this.reflector.getAllAndOverride<boolean>('isPublic', [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;
    return super.canActivate(context);
  }

  // passport strategy의 validate() 실행이 끝난 직후
  handleRequest<TUser = unknown>(
    err: unknown,
    user: TUser,
    info: unknown,
  ): TUser {
    if (err || !user) {
      if (info instanceof Error) throw new UnauthorizedException(info.message);
      throw err || new UnauthorizedException('인증에 실패했습니다');
    }
    return user;
  }
}
