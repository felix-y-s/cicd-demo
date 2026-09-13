import type {
  CursorPaginatedResult,
  CursorPaginationOptions,
  PaginatedResult,
  PaginationMeta,
  PaginationOptions,
} from './pagination.types.js';

/**
 * 페이지네이션 유틸리티 클래스
 *
 * 사용 패턴:
 * ```ts
 * // Controller: optional 필드로 받음
 * async getPosts(@Query() query: PaginationDto) { ... }
 *
 * // Controller → Service: normalize()로 Required 변환
 * const normalized = PaginationUtil.normalize(query);
 *
 * // Repository: Required 타입으로 받음
 * async find(options: Required<PaginationOptions>) { ... }
 * ```
 */
export class PaginationUtil {
  /**
   * 페이지네이션 메타데이터 생성
   */
  static createMeta(
    total: number,
    options: Required<Pick<PaginationOptions, 'page' | 'limit'>>,
  ): PaginationMeta {
    const { page, limit } = options;
    const totalPages = Math.ceil(total / limit);

    return {
      total,
      page,
      limit,
      totalPages,
      hasNextPage: page < totalPages,
      hasPreviousPage: page > 1,
      nextPage: page < totalPages ? page + 1 : null,
      previousPage: page > 1 ? page - 1 : null,
    };
  }

  /**
   * 페이지네이션 결과 생성 (items + meta)
   */
  static paginate<T>(
    items: T[],
    total: number,
    options: Required<Pick<PaginationOptions, 'page' | 'limit'>>,
  ): PaginatedResult<T> {
    return {
      items,
      meta: this.createMeta(total, options),
    };
  }

  /**
   * HTTP 레이어(DTO) → 도메인 타입 변환
   *
   * Controller에서 받은 PaginationDto 클래스 인스턴스를 plain object로
   * 추출해 서비스/레포지토리에 전달하는 레이어 경계 역할을 한다.
   */
  static normalize(options: PaginationOptions): Required<PaginationOptions> {
    return {
      page: options.page ?? 1,
      limit: options.limit ?? 10,
      sortBy: options.sortBy ?? 'createdAt',
      sortOrder: options.sortOrder ?? 'DESC',
    };
  }

  /**
   * Prisma용 페이지네이션 옵션 생성
   *
   * @example
   * const prismaOpts = PaginationUtil.getPrismaOptions(options);
   * await prisma.post.findMany(prismaOpts);
   */
  static getPrismaOptions(
    options: Required<Pick<PaginationOptions, 'page' | 'limit'>> &
      Pick<PaginationOptions, 'sortBy' | 'sortOrder'>,
  ): {
    skip: number;
    take: number;
    orderBy?: Record<string, 'asc' | 'desc'>;
  } {
    const { page, limit, sortBy, sortOrder } = options;

    const result: {
      skip: number;
      take: number;
      orderBy?: Record<string, 'asc' | 'desc'>;
    } = {
      skip: (page - 1) * limit,
      take: limit,
    };

    if (sortBy) {
      result.orderBy = {
        [sortBy]: sortOrder?.toLowerCase() === 'asc' ? 'asc' : 'desc',
      };
    }

    return result;
  }

  /**
   * MongoDB용 페이지네이션 옵션 생성
   *
   * @example
   * const mongoOpts = PaginationUtil.getMongoOptions(options);
   * await model.find().skip(mongoOpts.skip).limit(mongoOpts.limit).sort(mongoOpts.sort);
   */
  static getMongoOptions(
    options: Required<Pick<PaginationOptions, 'page' | 'limit'>> &
      Pick<PaginationOptions, 'sortBy' | 'sortOrder'>,
  ): {
    skip: number;
    limit: number;
    sort?: Record<string, 1 | -1>;
  } {
    const { page, limit, sortBy, sortOrder } = options;

    const result: {
      skip: number;
      limit: number;
      sort?: Record<string, 1 | -1>;
    } = {
      skip: (page - 1) * limit,
      limit,
    };

    if (sortBy) {
      result.sort = {
        [sortBy]: sortOrder === 'DESC' ? -1 : 1,
      };
    }

    return result;
  }

  /**
   * 커서 기반 페이지네이션 결과 생성
   *
   * DB에서 limit + 1 개를 조회한 후 이 메서드에 전달해야 한다.
   * 초과분(+1)은 다음 페이지 존재 여부 확인용으로만 사용된다.
   *
   * @example
   * const rows = await db.find({ id: { gt: cursor } }).limit(options.limit + 1);
   * return PaginationUtil.cursorPaginate(rows, options, (item) => item.id);
   */
  static cursorPaginate<T>(
    data: T[],
    options: CursorPaginationOptions,
    getCursor: (item: T) => string | number,
  ): CursorPaginatedResult<T> {
    const { limit } = options;
    const hasNextPage = data.length > limit;
    const items = hasNextPage ? data.slice(0, limit) : data;
    const nextCursor =
      hasNextPage && items.length > 0
        ? getCursor(items[items.length - 1])
        : null;

    return { items, nextCursor, hasNextPage };
  }

  /**
   * 빈 페이지네이션 결과 생성
   */
  static createEmptyResult<T>(
    options: Required<Pick<PaginationOptions, 'page' | 'limit'>>,
  ): PaginatedResult<T> {
    return this.paginate([], 0, options);
  }
}
