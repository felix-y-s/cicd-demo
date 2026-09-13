/**
 * 모든 성공 응답이 공통으로 갖는 래핑 스키마.
 * TransformInterceptor가 컨트롤러 반환값을 이 형태로 감싼다.
 */
export interface Response<T> {
  success: true;
  statusCode: number;
  data: T;
  timestamp: string;
  path: string;
}
