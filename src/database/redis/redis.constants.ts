/**
 * Redis 연결 Provider DI 토큰
 */
export const REDIS_CLIENT = 'REDIS_CLIENT';

/**
 * Redis 키 네이밍 팩토리 — 문자열 직접 사용 대신 이 함수들을 통해 키를 생성한다.
 * 오타 방지 및 키 구조 변경 시 한 곳만 수정하면 된다.
 */
export const RedisKeys = {
  // 인증
  refreshToken: (userId: string) => `refresh:${userId}`,
  blacklist: (jti: string) => `blacklist:${jti}`,
} as const;
