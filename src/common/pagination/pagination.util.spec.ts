import { describe, expect, it } from 'vitest';
import { PaginationUtil } from './pagination.util.js';

describe('PaginationUtil', () => {
  describe('normalize', () => {
    it('모든 값이 없으면 기본값을 반환한다', () => {
      const result = PaginationUtil.normalize({});

      expect(result.page).toBe(1);
      expect(result.limit).toBe(10);
      expect(result.sortOrder).toBe('DESC');
    });

    it('전달된 값을 그대로 사용한다', () => {
      const result = PaginationUtil.normalize({
        page: 3,
        limit: 20,
        sortOrder: 'ASC',
      });

      expect(result.page).toBe(3);
      expect(result.limit).toBe(20);
      expect(result.sortOrder).toBe('ASC');
    });

    it('반환 타입은 모든 필드가 Required다', () => {
      const result = PaginationUtil.normalize({});

      expect(result.page).toBeDefined();
      expect(result.limit).toBeDefined();
      expect(result.sortOrder).toBeDefined();
    });
  });

  describe('createMeta', () => {
    const baseOptions = { page: 1, limit: 10, sortOrder: 'DESC' as const };

    it('totalPages를 올바르게 계산한다 (Math.ceil)', () => {
      expect(PaginationUtil.createMeta(100, baseOptions).totalPages).toBe(10);
      expect(PaginationUtil.createMeta(101, baseOptions).totalPages).toBe(11);
      expect(PaginationUtil.createMeta(0, baseOptions).totalPages).toBe(0);
    });

    it('첫 페이지에서 hasPreviousPage는 false다', () => {
      const meta = PaginationUtil.createMeta(100, {
        page: 1,
        limit: 10,
      });

      expect(meta.hasPreviousPage).toBe(false);
      expect(meta.previousPage).toBeNull();
    });

    it('마지막 페이지에서 hasNextPage는 false다', () => {
      const meta = PaginationUtil.createMeta(100, {
        page: 10,
        limit: 10,
      });

      expect(meta.hasNextPage).toBe(false);
      expect(meta.nextPage).toBeNull();
    });

    it('중간 페이지에서 양쪽 모두 true다', () => {
      const meta = PaginationUtil.createMeta(100, {
        page: 5,
        limit: 10,
      });

      expect(meta.hasNextPage).toBe(true);
      expect(meta.hasPreviousPage).toBe(true);
      expect(meta.nextPage).toBe(6);
      expect(meta.previousPage).toBe(4);
    });

    it('total, page, limit 필드를 그대로 포함한다', () => {
      const meta = PaginationUtil.createMeta(42, { page: 2, limit: 15 });

      expect(meta.total).toBe(42);
      expect(meta.page).toBe(2);
      expect(meta.limit).toBe(15);
    });
  });

  describe('paginate', () => {
    const options = { page: 2, limit: 5 };

    it('items와 meta를 포함한 PaginatedResult를 반환한다', () => {
      const items = [{ id: 1 }, { id: 2 }];
      const result = PaginationUtil.paginate(items, 20, options);

      expect(result.items).toEqual(items);
      expect(result.meta).toBeDefined();
      expect(result.meta.total).toBe(20);
      expect(result.meta.page).toBe(2);
    });

    it('빈 배열도 올바르게 처리한다', () => {
      const result = PaginationUtil.paginate([], 0, { page: 1, limit: 10 });

      expect(result.items).toHaveLength(0);
      expect(result.meta.total).toBe(0);
      expect(result.meta.totalPages).toBe(0);
      expect(result.meta.hasNextPage).toBe(false);
    });
  });

  describe('getPrismaOptions', () => {
    it('page와 limit으로 skip을 계산한다', () => {
      const opts = PaginationUtil.getPrismaOptions({ page: 3, limit: 10 });

      expect(opts.skip).toBe(20);
      expect(opts.take).toBe(10);
    });

    it('page 1이면 skip은 0이다', () => {
      const opts = PaginationUtil.getPrismaOptions({ page: 1, limit: 10 });

      expect(opts.skip).toBe(0);
    });

    it('sortBy가 있으면 orderBy에 포함된다', () => {
      const opts = PaginationUtil.getPrismaOptions({
        page: 1,
        limit: 10,
        sortBy: 'createdAt',
        sortOrder: 'ASC',
      });

      expect(opts.orderBy).toEqual({ createdAt: 'asc' });
    });
  });

  describe('getMongoOptions', () => {
    it('page와 limit으로 skip을 계산한다', () => {
      const opts = PaginationUtil.getMongoOptions({ page: 2, limit: 5 });

      expect(opts.skip).toBe(5);
      expect(opts.limit).toBe(5);
    });

    it('sortBy가 있으면 sort에 포함된다', () => {
      const opts = PaginationUtil.getMongoOptions({
        page: 1,
        limit: 10,
        sortBy: 'createdAt',
        sortOrder: 'DESC',
      });

      expect(opts.sort).toEqual({ createdAt: -1 });
    });
  });

  describe('cursorPaginate', () => {
    it('items 수가 limit보다 많으면 hasNextPage가 true다', () => {
      const items = Array.from({ length: 11 }, (_, i) => ({ id: i + 1 }));
      const result = PaginationUtil.cursorPaginate(
        items,
        { limit: 10 },
        (item) => String(item.id),
      );

      expect(result.hasNextPage).toBe(true);
      expect(result.items).toHaveLength(10);
      expect(result.nextCursor).toBe('10');
    });

    it('items 수가 limit 이하면 hasNextPage가 false다', () => {
      const items = Array.from({ length: 5 }, (_, i) => ({ id: i + 1 }));
      const result = PaginationUtil.cursorPaginate(
        items,
        { limit: 10 },
        (item) => String(item.id),
      );

      expect(result.hasNextPage).toBe(false);
      expect(result.nextCursor).toBeNull();
    });

    it('빈 배열이면 nextCursor가 null이다', () => {
      const result = PaginationUtil.cursorPaginate<{ id: number }>(
        [],
        { limit: 10 },
        (item) => String(item.id),
      );

      expect(result.items).toHaveLength(0);
      expect(result.hasNextPage).toBe(false);
      expect(result.nextCursor).toBeNull();
    });
  });
});
