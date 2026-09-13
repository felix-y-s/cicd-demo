import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import type { StringValue } from 'ms';
import { RedisKeys } from '../../database/redis/redis.constants.js';
import { RedisService } from '../../database/redis/redis.service.js';
import { UsersRepository } from '../users/repositories/users.repository.js';
import { UsersService } from '../users/users.service.js';
import type { CreateUserDto } from './dto/create-user.dto.js';
import type { LoginDto } from './dto/login.dto.js';
import { InvalidRefreshTokenException } from '../../common/exception/index.js';

@Injectable()
export class AuthService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly usersService: UsersService,
    private readonly usersRepository: UsersRepository,
    private readonly redis: RedisService,
  ) {}

  /**
   * 회원가입 후 자동 로그인 — 사용자 생성 즉시 토큰 발급
   */
  async register(createUserDto: CreateUserDto) {
    await this.usersService.create(createUserDto);
    return this.login({
      email: createUserDto.email,
      password: createUserDto.password,
    });
  }

  /**
   * 로그인
   * @throws InvalidCredentialsException 이메일 또는 비밀번호가 일치하지 않는 경우
   */
  async login(loginDto: LoginDto) {
    const user = await this.usersService.validateUser(
      loginDto.email,
      loginDto.password,
    );

    const tokens = await this.generateAndStoreTokens(
      user.id,
      user.email,
      user.role,
    );

    const { passwordHash: _passwordHash, refreshTokenHash: _refreshTokenHash, ...userWithoutSecrets } = user;
    return { ...tokens, user: userWithoutSecrets };
  }

  /**
   * JWT Access Token과 Refresh Token을 동시에 발급합니다
   * - Access Token: ConfigService의 jwt.expiresIn (기본 15분)
   * - Refresh Token: ConfigService의 jwt.refreshExpiresIn (기본 7일)
   */
  private async generateTokens(userId: string, email: string, role: string) {
    // jti: 토큰마다 고유한 식별자. 같은 초에 재발급돼도 payload가 겹치지
    // 않도록 보장하고, 로그아웃 블랙리스트(방식 B) 키로도 사용한다.
    const payload = { sub: userId, email, role, jti: randomUUID() };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(
        { ...payload, type: 'access' },
        {
          secret: this.configService.get<string>('jwt.secret'),
          expiresIn: this.configService.get<string>(
            'jwt.expiresIn',
          ) as StringValue,
        },
      ),
      this.jwtService.signAsync(
        { ...payload, type: 'refresh' },
        {
          secret: this.configService.get<string>('jwt.refreshSecret'),
          expiresIn: this.configService.get<string>(
            'jwt.refreshExpiresIn',
          ) as StringValue,
        },
      ),
    ]);

    return { accessToken, refreshToken };
  }

  /**
   * 토큰 발급 + Refresh Token 해시를 User.refreshTokenHash에 저장 (방식 C 토대)
   */
  private async generateAndStoreTokens(
    userId: string,
    email: string,
    role: string,
  ) {
    const tokens = await this.generateTokens(userId, email, role);
    const refreshTokenHash = await bcrypt.hash(tokens.refreshToken, 10);
    await this.usersRepository.updateRefreshTokenHash(userId, refreshTokenHash);
    return tokens;
  }

  /**
   * Refresh Token으로 새로운 Access Token 발급
   * @description Refresh Token 서명 유효성은 JwtRefreshAuthGuard에서 검증한다.
   *              이 메서드는 DB에 저장된 refreshTokenHash와 대조해 로그아웃된
   *              (또는 이미 한 번 재발급에 사용된) 토큰을 추가로 거부한다.
   */
  async refreshAccessToken(userId: string, presentedRefreshToken: string) {
    const user = await this.usersRepository.findById(userId);
    if (!user || !user.refreshTokenHash) {
      throw new InvalidRefreshTokenException();
    }

    const isValid = await bcrypt.compare(
      presentedRefreshToken,
      user.refreshTokenHash,
    );
    if (!isValid) throw new InvalidRefreshTokenException();

    // 토큰 재발급 (access + refresh 둘 다 갱신, DB의 해시도 교체)
    return this.generateAndStoreTokens(user.id, user.email, user.role);
  }

  /**
   * 로그아웃 — 방식 B(Access 블랙리스트) + 방식 C(Refresh DB 삭제) 병행
   * @param jti 현재 Access Token의 jti (블랙리스트 등록용)
   * @param exp 현재 Access Token의 만료 시각(초) — 블랙리스트 TTL 계산용
   * @param userId Refresh Token 레코드를 삭제할 사용자 ID
   * @description DB(refreshTokenHash 삭제)를 먼저 처리해 재발급 경로부터
   *              차단한다. 이후 Redis 블랙리스트 등록이 실패하더라도,
   *              이미 무효화된 refresh token으로는 새 토큰을 재발급받을
   *              수 없으므로 탈취된 세션이 access token의 남은 TTL(수 분)
   *              이상 유지되지 않는다. 반대 순서라면 Redis만 성공하고 DB
   *              갱신이 실패할 경우 refresh token이 그대로 남아 무기한
   *              재발급이 가능해진다.
   */
  async logout(jti: string, exp: number, userId: string): Promise<void> {
    await this.usersRepository.updateRefreshTokenHash(userId, null);

    const ttl = exp - Math.floor(Date.now() / 1000);
    if (ttl > 0) {
      await this.redis.set(RedisKeys.blacklist(jti), '1', ttl);
    }
  }
}
