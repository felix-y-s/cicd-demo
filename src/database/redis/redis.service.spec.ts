import type { Redis } from 'ioredis';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RedisService } from './redis.service.js';

describe('RedisService', () => {
  let service: RedisService;
  let mockRedis: Record<string, ReturnType<typeof vi.fn>>;

  beforeEach(() => {
    mockRedis = {
      set: vi.fn(),
      setex: vi.fn(),
      get: vi.fn(),
      del: vi.fn(),
      exists: vi.fn(),
      ttl: vi.fn(),
      hget: vi.fn(),
      hgetall: vi.fn(),
    };
    service = new RedisService(mockRedis as unknown as Redis);
  });

  describe('set/get', () => {
    it('문자열이 아닌 값은 JSON으로 직렬화해 저장한다', async () => {
      await service.set('key', { a: 1 }, 60);
      expect(mockRedis.setex).toHaveBeenCalledWith(
        'key',
        60,
        JSON.stringify({ a: 1 }),
      );
    });

    it('TTL 없이 저장하면 set()을 사용한다', async () => {
      await service.set('key', 'value');
      expect(mockRedis.set).toHaveBeenCalledWith('key', 'value');
    });

    it('빈 문자열 값도 null이 아닌 빈 문자열로 반환한다', async () => {
      mockRedis.get.mockResolvedValue('');
      const result = await service.get('key');
      expect(result).toBe('');
    });

    it('키가 없으면 null을 반환한다', async () => {
      mockRedis.get.mockResolvedValue(null);
      const result = await service.get('key');
      expect(result).toBeNull();
    });

    it('JSON 파싱 가능한 값은 파싱해 반환한다', async () => {
      mockRedis.get.mockResolvedValue(JSON.stringify({ a: 1 }));
      const result = await service.get<{ a: number }>('key');
      expect(result).toEqual({ a: 1 });
    });
  });

  describe('delete/exists', () => {
    it('삭제된 키가 있으면 true를 반환한다', async () => {
      mockRedis.del.mockResolvedValue(1);
      expect(await service.delete('key')).toBe(true);
    });

    it('삭제할 키가 없으면 false를 반환한다', async () => {
      mockRedis.del.mockResolvedValue(0);
      expect(await service.delete('key')).toBe(false);
    });

    it('exists는 1일 때 true를 반환한다', async () => {
      mockRedis.exists.mockResolvedValue(1);
      expect(await service.exists('key')).toBe(true);
    });
  });

  describe('hget', () => {
    it('필드 값이 없으면 null을 반환한다(빈 문자열은 그대로 반환)', async () => {
      mockRedis.hget.mockResolvedValue(null);
      expect(await service.hget('key', 'field')).toBeNull();

      mockRedis.hget.mockResolvedValue('');
      expect(await service.hget('key', 'field')).toBe('');
    });
  });
});
