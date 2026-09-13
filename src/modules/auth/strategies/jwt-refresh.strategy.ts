import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import type { Request } from 'express';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type {
  JwtPayload,
  JwtValidationResult,
} from '../interfaces/jwt-payload.interface.js';

@Injectable()
export class JwtRefreshStrategy extends PassportStrategy(
  Strategy,
  'jwt-refresh',
) {
  constructor(configService: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      // Access Token과 다른 시크릿 키를 사용해야 보안이 강화됩니다
      secretOrKey: configService.get<string>('jwt.refreshSecret') as string,
      // 서명 검증을 통과한 원문 토큰 문자열을 validate()에서 쓰기 위해
      // request를 함께 받는다 — AuthService.refreshAccessToken()이
      // DB의 refreshTokenHash와 bcrypt.compare할 대상이 필요하기 때문이다.
      passReqToCallback: true,
    });
  }

  validate(req: Request, payload: JwtPayload): JwtValidationResult {
    // Refresh Token만 허용 — Access Token으로 재발급 요청 차단
    if (payload.type && payload.type !== 'refresh') {
      throw new UnauthorizedException('유효하지 않은 토큰 타입입니다');
    }
    if (
      !payload.sub ||
      !payload.email ||
      !payload.role ||
      !payload.jti ||
      !payload.exp
    ) {
      throw new UnauthorizedException('토큰에 필수 정보가 누락되었습니다');
    }

    const refreshToken = ExtractJwt.fromAuthHeaderAsBearerToken()(req);
    if (!refreshToken) {
      // ExtractJwt가 이미 이 값을 찾아 서명 검증을 통과했으므로 실제로는
      // 도달하지 않지만, 타입 안정성과 방어적 코딩을 위해 명시적으로 처리한다.
      throw new UnauthorizedException('Refresh Token을 찾을 수 없습니다');
    }

    // 이 반환값은 @nestjs/passport가 req.user에 실어주며, @CurrentUser()가 그걸 읽는다
    return {
      userId: payload.sub,
      email: payload.email,
      role: payload.role,
      jti: payload.jti,
      exp: payload.exp,
      refreshToken,
    };
  }
}
