import { describe, expect, it } from 'vitest';
import { ActivityLogSchema } from './activity-log.schema.js';

describe('ActivityLogSchema', () => {
  const schema = ActivityLogSchema;

  describe('필드 존재 여부', () => {
    it('userId 필드가 스키마에 정의되어 있다', () => {
      expect(schema.path('userId')).toBeDefined();
    });

    it('action 필드가 스키마에 정의되어 있다', () => {
      expect(schema.path('action')).toBeDefined();
    });

    it('metadata 필드가 스키마에 정의되어 있다', () => {
      expect(schema.path('metadata')).toBeDefined();
    });
  });

  describe('required 제약 조건', () => {
    it('userId는 필수 필드다', () => {
      expect(schema.path('userId').isRequired).toBe(true);
    });

    it('action은 필수 필드다', () => {
      expect(schema.path('action').isRequired).toBe(true);
    });

    it('metadata는 필수가 아니다', () => {
      expect(schema.path('metadata').isRequired).toBeFalsy();
    });
  });

  describe('타입 검증', () => {
    it('userId는 String 타입이다', () => {
      expect(schema.path('userId').instance).toBe('String');
    });

    it('action은 String 타입이다', () => {
      expect(schema.path('action').instance).toBe('String');
    });

    it('metadata는 Mixed 타입이다', () => {
      expect(schema.path('metadata').instance).toBe('Mixed');
    });
  });

  describe('timestamps 설정', () => {
    it('createdAt 경로가 스키마에 존재한다', () => {
      expect(schema.path('createdAt')).toBeDefined();
    });

    it('updatedAt 경로가 스키마에 존재한다', () => {
      expect(schema.path('updatedAt')).toBeDefined();
    });
  });

  describe('인덱스', () => {
    it('userId + createdAt 복합 인덱스가 존재한다', () => {
      const indexes = schema.indexes();
      const hasCompoundIndex = indexes.some(
        ([fields]) => fields.userId === 1 && fields.createdAt === -1,
      );
      expect(hasCompoundIndex).toBe(true);
    });
  });
});
