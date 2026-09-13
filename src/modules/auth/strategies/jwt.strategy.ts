import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { RedisKeys } from '../../../database/redis/redis.constants.js';
import { RedisService } from '../../../database/redis/redis.service.js';
import type {
  JwtPayload,
  JwtValidationResult,
} from '../interfaces/jwt-payload.interface.js';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    configService: ConfigService,
    private readonly redis: RedisService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('jwt.secret') as string,
    });
  }

  async validate(payload: JwtPayload): Promise<JwtValidationResult> {
    // Access Token만 허용 — Refresh Token으로 일반 엔드포인트 접근 차단
    if (payload.type && payload.type !== 'access') {
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

    // 로그아웃 시 블랙리스트에 등록된 jti는 즉시 거부 (방식 B)
    const isBlacklisted = await this.redis.exists(
      RedisKeys.blacklist(payload.jti),
    );
    if (isBlacklisted) {
      throw new UnauthorizedException('만료된 토큰입니다');
    }

    // 이 반환값은 @nestjs/passport가 req.user에 실어주며, @CurrentUser()가 그걸 읽는다
    return {
      userId: payload.sub,
      email: payload.email,
      role: payload.role,
      jti: payload.jti,
      exp: payload.exp,
    };
  }
}
