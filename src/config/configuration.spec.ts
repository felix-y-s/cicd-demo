import { beforeEach, afterAll, describe, expect, it } from 'vitest';
import configuration from './configuration.js';

describe('configuration', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('app 섹션', () => {
    it('NODE_ENV 미설정 시 development를 기본값으로 반환한다', () => {
      delete process.env.NODE_ENV;
      expect(configuration().app.nodeEnv).toBe('development');
    });

    it('PORT 미설정 시 3000을 기본값으로 반환한다', () => {
      delete process.env.PORT;
      expect(configuration().app.port).toBe(3000);
    });

    it('PORT가 설정된 경우 숫자로 변환하여 반환한다', () => {
      process.env.PORT = '8080';
      const config = configuration();
      expect(config.app.port).toBe(8080);
      expect(typeof config.app.port).toBe('number');
    });

    it('CORS_ORIGIN을 쉼표 기준으로 배열로 변환한다', () => {
      process.env.CORS_ORIGIN = 'http://a.com,http://b.com';
      expect(configuration().app.corsOrigin).toEqual([
        'http://a.com',
        'http://b.com',
      ]);
    });
  });

  describe('database 섹션', () => {
    it('DATABASE_URL이 설정된 경우 해당 값을 반환한다', () => {
      process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/db';
      expect(configuration().database.postgres.url).toBe(
        'postgresql://user:pass@localhost:5432/db',
      );
    });

    it('REDIS_PORT 미설정 시 6379를 기본값으로 반환한다', () => {
      delete process.env.REDIS_PORT;
      expect(configuration().database.redis.port).toBe(6379);
    });
  });

  describe('jwt 섹션', () => {
    it('JWT_SECRET이 설정된 경우 해당 값을 반환한다', () => {
      process.env.JWT_SECRET = 'test-secret-key';
      expect(configuration().jwt.secret).toBe('test-secret-key');
    });

    it('JWT_SECRET 미설정 시 undefined를 반환한다 (joi가 앱 기동 시 차단)', () => {
      delete process.env.JWT_SECRET;
      expect(configuration().jwt.secret).toBeUndefined();
    });

    it('JWT_EXPIRES_IN 미설정 시 기본값 15m을 반환한다', () => {
      delete process.env.JWT_EXPIRES_IN;
      expect(configuration().jwt.expiresIn).toBe('15m');
    });
  });

  describe('swagger 섹션', () => {
    it('SWAGGER_ENABLED=false일 때 false를 반환한다', () => {
      process.env.SWAGGER_ENABLED = 'false';
      expect(configuration().swagger.enabled).toBe(false);
    });

    it('SWAGGER_ENABLED 미설정 시 true를 기본값으로 반환한다', () => {
      delete process.env.SWAGGER_ENABLED;
      expect(configuration().swagger.enabled).toBe(true);
    });
  });

  describe('네임스페이스 구조', () => {
    it('app 네임스페이스 키가 모두 존재한다', () => {
      const config = configuration();
      expect(config).toHaveProperty('app.nodeEnv');
      expect(config).toHaveProperty('app.port');
    });

    it('jwt 네임스페이스 키가 모두 존재한다', () => {
      const config = configuration();
      expect(config).toHaveProperty('jwt.secret');
      expect(config).toHaveProperty('jwt.expiresIn');
      expect(config).toHaveProperty('jwt.refreshSecret');
      expect(config).toHaveProperty('jwt.refreshExpiresIn');
    });

    it('throttle 네임스페이스 키가 모두 존재한다', () => {
      const config = configuration();
      expect(config).toHaveProperty('throttle.shortTtl');
      expect(config).toHaveProperty('throttle.mediumTtl');
      expect(config).toHaveProperty('throttle.longTtl');
    });
  });
});
