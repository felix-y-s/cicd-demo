import { describe, expect, it } from 'vitest';
import { validationSchema } from './validation.schema.js';

describe('validationSchema', () => {
  const validEnv = {
    NODE_ENV: 'development',
    PORT: 3000,
    DATABASE_URL: 'postgresql://nest:nest@localhost:5432/nest_template',
    MONGODB_URI: 'mongodb://nest:nest@localhost:27017/nest_template',
    REDIS_HOST: 'localhost',
    RABBITMQ_URL: 'amqp://nest:nest@localhost:5672',
    JWT_SECRET: 'valid-secret-key-that-is-32-chars-long!',
    JWT_REFRESH_SECRET: 'valid-refresh-secret-32-chars-long!!',
  };

  describe('유효한 환경변수', () => {
    it('필수 환경변수가 모두 제공되면 검증을 통과한다', () => {
      const { error } = validationSchema.validate(validEnv, {
        abortEarly: false,
      });
      expect(error).toBeUndefined();
    });

    it('PORT 미설정 시 기본값 3000으로 통과한다', () => {
      const { error, value } = validationSchema.validate(
        { ...validEnv, PORT: undefined },
        { abortEarly: false, allowUnknown: true },
      );
      expect(error).toBeUndefined();
      expect(value.PORT).toBe(3000);
    });
  });

  describe('필수 환경변수 누락', () => {
    it('DATABASE_URL 누락 시 오류를 반환한다', () => {
      const { error } = validationSchema.validate(
        { ...validEnv, DATABASE_URL: undefined },
        { abortEarly: false },
      );
      expect(error).toBeDefined();
      expect(
        error?.details.some((d) => d.path.includes('DATABASE_URL')),
      ).toBe(true);
    });

    it('MONGODB_URI 누락 시 오류를 반환한다', () => {
      const { error } = validationSchema.validate(
        { ...validEnv, MONGODB_URI: undefined },
        { abortEarly: false },
      );
      expect(error).toBeDefined();
    });

    it('JWT_SECRET 누락 시 오류를 반환한다', () => {
      const { error } = validationSchema.validate(
        { ...validEnv, JWT_SECRET: undefined },
        { abortEarly: false },
      );
      expect(error).toBeDefined();
      expect(error?.details.some((d) => d.path.includes('JWT_SECRET'))).toBe(
        true,
      );
    });

    it('여러 필수값 누락 시 모든 오류를 한 번에 반환한다 (abortEarly: false)', () => {
      const { error } = validationSchema.validate(
        {
          ...validEnv,
          JWT_SECRET: undefined,
          JWT_REFRESH_SECRET: undefined,
          DATABASE_URL: undefined,
        },
        { abortEarly: false },
      );
      expect(error?.details.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe('제약 조건 검증', () => {
    it('32자 미만의 JWT_SECRET은 거부한다 (min(32))', () => {
      const { error } = validationSchema.validate(
        { ...validEnv, JWT_SECRET: 'short' },
        { abortEarly: false },
      );
      expect(error).toBeDefined();
      expect(error?.details.some((d) => d.path.includes('JWT_SECRET'))).toBe(
        true,
      );
    });

    it('허용되지 않는 NODE_ENV 값은 거부한다', () => {
      const { error } = validationSchema.validate(
        { ...validEnv, NODE_ENV: 'staging' },
        { abortEarly: false },
      );
      expect(error).toBeDefined();
    });

    it.each(['development', 'production', 'test'])(
      'NODE_ENV=%s는 통과한다',
      (nodeEnv) => {
        const { error } = validationSchema.validate(
          { ...validEnv, NODE_ENV: nodeEnv },
          { abortEarly: false },
        );
        expect(error).toBeUndefined();
      },
    );
  });
});
