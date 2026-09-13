import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator.js';
import { Role } from '../enums/role.enum.js';
import type { JwtValidationResult } from '../interfaces/jwt-payload.interface.js';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<Role[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );
    // @Roles() 없으면 역할 제한 없음
    if (!requiredRoles || requiredRoles.length === 0) return true;

    const request = context
      .switchToHttp()
      .getRequest<{ user: JwtValidationResult }>();
    const user = request.user;

    if (!user) throw new ForbiddenException('사용자 인증 정보를 찾을 수 없습니다');
    if (!user.role) throw new ForbiddenException('사용자 역할 정보를 찾을 수 없습니다');
    if (!requiredRoles.includes(user.role as Role)) {
      throw new ForbiddenException('이 작업을 수행할 권한이 없습니다');
    }
    return true;
  }
}
