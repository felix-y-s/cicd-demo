/**
 * 페이지네이션 옵션
 * - Controller: @Query() 바인딩 시 모든 필드 optional
 * - Service/Repository: Required<PaginationOptions>로 기본값 보장
 */
export interface PaginationOptions {
  /** 현재 페이지 번호 (1부터 시작) */
  page?: number;
  /** 페이지당 항목 수 */
  limit?: number;
  /** 정렬 필드 */
  sortBy?: string;
  /** 정렬 순서 */
  sortOrder?: 'ASC' | 'DESC';
}

/**
 * 페이지네이션 메타데이터
 * API 응답에 포함되는 페이지네이션 정보
 */
export interface PaginationMeta {
  /** 전체 항목 수 */
  total: number;
  /** 현재 페이지 번호 */
  page: number;
  /** 페이지당 항목 수 */
  limit: number;
  /** 전체 페이지 수 */
  totalPages: number;
  /** 다음 페이지 존재 여부 */
  hasNextPage: boolean;
  /** 이전 페이지 존재 여부 */
  hasPreviousPage: boolean;
  /** 다음 페이지 번호 (없으면 null) */
  nextPage: number | null;
  /** 이전 페이지 번호 (없으면 null) */
  previousPage: number | null;
}

/**
 * 오프셋 기반 페이지네이션 결과
 * Service/Repository에서 반환하는 인터페이스
 */
export interface PaginatedResult<T> {
  /** 데이터 배열 */
  items: T[];
  /** 페이지네이션 메타데이터 */
  meta: PaginationMeta;
}

/**
 * 커서 기반 페이지네이션 옵션
 * 무한 스크롤이나 대용량 데이터 페이지네이션에 사용
 */
export interface CursorPaginationOptions {
  /** 커서 (마지막 항목의 ID 또는 타임스탬프) */
  cursor?: string | number;
  /** 페이지당 항목 수 */
  limit: number;
  /** 정렬 순서 */
  sortOrder?: 'ASC' | 'DESC';
}

/**
 * 커서 기반 페이지네이션 결과
 * 무한 스크롤 응답 형식
 */
export interface CursorPaginatedResult<T> {
  /** 데이터 배열 */
  items: T[];
  /** 다음 커서 (없으면 null) */
  nextCursor: string | number | null;
  /** 다음 페이지 존재 여부 */
  hasNextPage: boolean;
}
