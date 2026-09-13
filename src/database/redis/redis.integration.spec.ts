import { randomUUID } from 'node:crypto';
import { ConfigModule } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import type { Redis } from 'ioredis';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import configuration from '../../config/configuration.js';
import { RedisModule, REDIS_CLIENT } from './redis.module.js';
import { RedisService } from './redis.service.js';

describe('RedisService 연결 테스트', () => {
  let service: RedisService;
  let redis: Redis;
  let testKey: string;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, load: [configuration] }),
        RedisModule.forRoot(),
      ],
    }).compile();

    service = module.get<RedisService>(RedisService);
    redis = module.get<Redis>(REDIS_CLIENT);
  });

  afterAll(async () => {
    await redis.quit();
  });

  afterEach(async () => {
    if (testKey) {
      await redis.del(testKey);
    }
  });

  it('서버에 연결할 수 있다 (PING)', async () => {
    const result = await service.ping();
    expect(result).toBe('PONG');
  });

  describe('set/get', () => {
    it('실제로 값을 저장하고 조회한다', async () => {
      testKey = `test:${randomUUID()}`;

      await service.set(testKey, { hello: 'world' });
      const result = await service.get<{ hello: string }>(testKey);

      expect(result).toEqual({ hello: 'world' });
    });

    it('TTL이 지정되면 실제로 만료 시간이 설정된다', async () => {
      testKey = `test:${randomUUID()}`;

      await service.set(testKey, 'value', 60);
      const ttl = await service.getTTL(testKey);

      expect(ttl).toBeGreaterThan(0);
      expect(ttl).toBeLessThanOrEqual(60);
    });
  });

  describe('delete/exists', () => {
    it('저장된 키를 삭제하면 exists가 false를 반환한다', async () => {
      testKey = `test:${randomUUID()}`;

      await service.set(testKey, 'value');
      expect(await service.exists(testKey)).toBe(true);

      const deleted = await service.delete(testKey);
      expect(deleted).toBe(true);
      expect(await service.exists(testKey)).toBe(false);
    });
  });

  describe('incr', () => {
    it('원자적으로 값을 증가시킨다', async () => {
      testKey = `test:${randomUUID()}`;

      const first = await service.incr(testKey);
      const second = await service.incr(testKey);

      expect(first).toBe(1);
      expect(second).toBe(2);
    });
  });
});
