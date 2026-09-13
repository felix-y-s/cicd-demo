import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import {
  ApiCreateResponses,
  ApiPublicResponses,
} from '../../common/swagger/index.js';
import { AuthService } from './auth.service.js';
import { CurrentUser } from './decorators/current-user.decorator.js';
import { Public } from './decorators/public.decorator.js';
import { AuthResponseDto, AuthTokensDto } from './dto/auth-response.dto.js';
import { CreateUserDto } from './dto/create-user.dto.js';
import { LoginDto } from './dto/login.dto.js';
import { JwtRefreshAuthGuard } from './guards/jwt-refresh-auth.guard.js';
import type { JwtValidationResult } from './interfaces/jwt-payload.interface.js';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  // Brute Force 방지 — 짧은 시간 내 반복 시도를 제한
  @Public()
  @Throttle({ short: {} })
  @ApiOperation({
    summary: '회원가입',
    description: '이메일/비밀번호로 회원가입 후 자동 로그인합니다.',
  })
  @ApiCreateResponses(AuthResponseDto, '회원가입 및 자동 로그인 성공')
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  async register(@Body() createUserDto: CreateUserDto) {
    return this.authService.register(createUserDto);
  }

  @Public()
  @Throttle({ short: {} })
  @ApiOperation({ summary: '로그인' })
  @ApiPublicResponses(200, AuthResponseDto, '로그인 성공')
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() loginDto: LoginDto) {
    return this.authService.login(loginDto);
  }

  // @Public()이 없으면 전역 JwtAuthGuard가 Access Token을 먼저 검증해 401이 난다.
  // refreshToken은 Authorization 헤더로만 전달한다(Bearer {refreshToken}) —
  // JwtRefreshStrategy가 서명 검증을 통과한 원문 토큰을 CurrentUser에 실어준다.
  @Public()
  @Throttle({ short: {} })
  @UseGuards(JwtRefreshAuthGuard)
  @ApiBearerAuth('refresh-token')
  @ApiOperation({
    summary: 'Access Token 재발급',
    description:
      'Authorization 헤더의 Refresh Token으로 새로운 Access/Refresh Token 쌍을 발급합니다.',
  })
  @ApiPublicResponses(200, AuthTokensDto, '재발급 성공')
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(@CurrentUser() user: JwtValidationResult) {
    // JwtRefreshAuthGuard를 통과했다는 것은 refreshToken이 서명/타입/만료
    // 검증을 이미 통과했다는 뜻이다 — user.refreshToken은 항상 존재한다.
    return this.authService.refreshAccessToken(
      user.userId,
      user.refreshToken as string,
    );
  }

  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: '로그아웃',
    description:
      'Access Token을 블랙리스트에 등록하고 Refresh Token을 무효화합니다.',
  })
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(@CurrentUser() user: JwtValidationResult): Promise<void> {
    await this.authService.logout(user.jti, user.exp, user.userId);
  }
}
