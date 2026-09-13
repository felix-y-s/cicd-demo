import { Injectable, Inject } from '@nestjs/common';
import { Redis } from 'ioredis';
import { REDIS_CLIENT } from './redis.constants.js';

/**
 * Redis 서비스
 * 캐싱, 세션 관리, 실시간 데이터 처리 기능
 */
@Injectable()
export class RedisService {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  /**
   * JSON 파싱 유틸리티
   * JSON 파싱 성공 시 파싱된 값, 실패 시 원본 문자열을 반환
   */
  private parseValue<T>(value: string): T {
    try {
      return JSON.parse(value) as T;
    } catch {
      return value as T;
    }
  }

  // ===== 기본 Key-Value 작업 =====

  /**
   * 키-값 저장
   * @param key 저장할 키
   * @param value 저장할 값 (문자열이 아니면 JSON으로 직렬화)
   * @param ttlSeconds 만료 시간(초), 미지정 시 만료 없음
   */
  async set(key: string, value: unknown, ttlSeconds?: number): Promise<void> {
    const stringValue =
      typeof value === 'string' ? value : JSON.stringify(value);
    if (ttlSeconds) {
      await this.redis.setex(key, ttlSeconds, stringValue);
    } else {
      await this.redis.set(key, stringValue);
    }
  }

  /**
   * 키로 값 조회
   * @param key 조회할 키
   * @returns 파싱된 값, 키가 없으면 null
   */
  async get<T = unknown>(key: string): Promise<T | null> {
    const value = await this.redis.get(key);
    // !value 금지: 빈 문자열 '' 도 null로 처리되어 데이터 손실 발생
    if (value === null || value === undefined) return null;
    return this.parseValue<T>(value);
  }

  /**
   * 키 삭제
   * @param key 삭제할 키
   * @returns 키가 존재하여 삭제되면 true, 없으면 false
   */
  async delete(key: string): Promise<boolean> {
    const result = await this.redis.del(key);
    return result > 0;
  }

  /**
   * 키 존재 여부 확인
   * @param key 확인할 키
   * @returns 키 존재 시 true
   */
  async exists(key: string): Promise<boolean> {
    const result = await this.redis.exists(key);
    return result === 1;
  }

  /**
   * 키의 남은 TTL 조회
   * @param key 조회할 키
   * @returns TTL(초), 키 없으면 -2, TTL 없으면 -1
   */
  async getTTL(key: string): Promise<number> {
    return this.redis.ttl(key);
  }

  /**
   * 패턴에 매칭되는 키 목록 조회
   * @param pattern 검색 패턴 (예: 'user:*')
   * @returns 매칭된 키 목록
   */
  async keys(pattern: string): Promise<string[]> {
    return this.redis.keys(pattern);
  }

  // ===== 카운터 작업 =====

  /**
   * 값 1 증가 (원자적 연산). 키가 없으면 0에서 시작
   * @param key 증가시킬 키
   */
  async incr(key: string): Promise<number> {
    return this.redis.incr(key);
  }

  /**
   * 값 1 감소 (원자적 연산)
   * @param key 감소시킬 키
   */
  async decr(key: string): Promise<number> {
    return this.redis.decr(key);
  }

  /**
   * TTL 설정 (기존 값 유지, 만료 시간만 갱신)
   * @param key 대상 키
   * @param ttlSeconds 만료 시간 (초)
   */
  async expire(key: string, ttlSeconds: number): Promise<boolean> {
    const result = await this.redis.expire(key, ttlSeconds);
    return result === 1;
  }

  // ===== Hash 작업 (객체 저장용) =====

  async hset(key: string, field: string, value: unknown): Promise<number> {
    const stringValue =
      typeof value === 'string' ? value : JSON.stringify(value);
    return this.redis.hset(key, field, stringValue);
  }

  async hget<T = unknown>(key: string, field: string): Promise<T | null> {
    const value = await this.redis.hget(key, field);
    if (value === null || value === undefined) return null;
    return this.parseValue<T>(value);
  }

  async hgetall<T = Record<string, unknown>>(key: string): Promise<T | null> {
    const value = await this.redis.hgetall(key);
    if (!value || Object.keys(value).length === 0) return null;
    const parsed: Record<string, unknown> = {};
    for (const [field, val] of Object.entries(value)) {
      parsed[field] = this.parseValue(val);
    }
    return parsed as T;
  }

  async hdel(key: string, field: string): Promise<number> {
    return this.redis.hdel(key, field);
  }

  // ===== List 작업 (큐/스택용) =====

  async lpush(key: string, value: unknown): Promise<number> {
    const stringValue =
      typeof value === 'string' ? value : JSON.stringify(value);
    return this.redis.lpush(key, stringValue);
  }

  async lpop<T = unknown>(key: string): Promise<T | null> {
    const value = await this.redis.lpop(key);
    if (value === null || value === undefined) return null;
    return this.parseValue<T>(value);
  }

  async rpop<T = unknown>(key: string): Promise<T | null> {
    const value = await this.redis.rpop(key);
    if (value === null || value === undefined) return null;
    return this.parseValue<T>(value);
  }

  async lrange<T = unknown>(
    key: string,
    start: number,
    stop: number,
  ): Promise<T[]> {
    const values = await this.redis.lrange(key, start, stop);
    return values.map((value) => this.parseValue<T>(value));
  }

  async ltrim(key: string, start: number, stop: number): Promise<void> {
    await this.redis.ltrim(key, start, stop);
  }

  // ===== Set 작업 (중복 없는 집합) =====

  async sadd(key: string, ...members: unknown[]): Promise<number> {
    const stringMembers = members.map((m) =>
      typeof m === 'string' ? m : JSON.stringify(m),
    );
    return this.redis.sadd(key, ...stringMembers);
  }

  async smembers<T = unknown>(key: string): Promise<T[]> {
    const members = await this.redis.smembers(key);
    return members.map((m) => this.parseValue<T>(m));
  }

  async srem(key: string, member: unknown): Promise<number> {
    const stringMember =
      typeof member === 'string' ? member : JSON.stringify(member);
    return this.redis.srem(key, stringMember);
  }

  /**
   * Set에 특정 멤버가 존재하는지 확인 (O(1))
   */
  async sismember(key: string, member: unknown): Promise<boolean> {
    const stringMember =
      typeof member === 'string' ? member : JSON.stringify(member);
    const result = await this.redis.sismember(key, stringMember);
    return result === 1;
  }

  // ===== 유틸리티 =====

  async ping(): Promise<string> {
    return this.redis.ping();
  }

  /**
   * 모든 키 삭제 (주의: 테스트 환경 전용!)
   */
  async flushall(): Promise<string> {
    return this.redis.flushall();
  }
}
