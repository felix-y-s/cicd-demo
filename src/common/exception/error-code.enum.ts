/**
 * 도메인 전역에서 사용하는 에러 코드.
 * 클라이언트가 이 값으로 실패 사유를 분기하므로, 한번 배포된 값은
 * 이름을 바꾸지 않는다(새 코드가 필요하면 추가만 한다).
 */
export enum ErrorCode {
  // auth
  INVALID_CREDENTIALS = 'INVALID_CREDENTIALS',
  ACCOUNT_LOCKED = 'ACCOUNT_LOCKED',
  INVALID_REFRESH_TOKEN = 'INVALID_REFRESH_TOKEN',

  // users
  EMAIL_ALREADY_EXISTS = 'EMAIL_ALREADY_EXISTS',

  // posts
  POST_NOT_FOUND = 'POST_NOT_FOUND',
  POST_FORBIDDEN = 'POST_FORBIDDEN',

  // activity-logs
  ACTIVITY_LOG_NOT_FOUND = 'ACTIVITY_LOG_NOT_FOUND',

  // 도메인별로 섹션을 나눠 추가한다
}
