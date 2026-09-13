export interface JwtPayload {
  sub: string; // 사용자 ID (UUID)
  email: string;
  role: string;
  jti: string; // 토큰마다 고유한 식별자 — 로그아웃 블랙리스트 키로 사용
  iat?: number;
  exp?: number;
  type?: 'access' | 'refresh';
}

export interface JwtValidationResult {
  userId: string; // payload.sub에서 매핑 — 컨트롤러에서는 user.userId로 접근
  email: string;
  role: string;
  jti: string; // payload.jti에서 매핑 — 로그아웃 시 블랙리스트 키로 사용
  exp: number; // payload.exp에서 매핑 — 블랙리스트 TTL 계산에 사용
  // JwtRefreshStrategy에서만 채워짐 — DB에 저장된 refreshTokenHash와
  // bcrypt.compare로 대조하려면 서명 검증을 통과한 원문 토큰 문자열이
  // 필요하다. Access Token 검증(JwtStrategy)에서는 사용하지 않는다.
  refreshToken?: string;
}
