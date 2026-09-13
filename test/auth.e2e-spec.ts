import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/database/prisma/prisma.service.js';
import { createTestApp } from './utils/create-test-app.js';

describe('Auth (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const testEmail = `e2e-auth-${Date.now()}@example.com`;
  const testPassword = 'password123';

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: testEmail } });
    await app.close();
  });

  describe('POST /auth/register', () => {
    it('회원가입 후 자동 로그인되어 토큰과 사용자 정보를 반환한다', async () => {
      const { body } = await request(app.getHttpServer())
        .post('/auth/register')
        .send({ email: testEmail, password: testPassword })
        .expect(201);

      expect(body.data.accessToken).toBeDefined();
      expect(body.data.refreshToken).toBeDefined();
      expect(body.data.user).toMatchObject({ email: testEmail, role: 'USER' });
      expect(body.data.user.passwordHash).toBeUndefined();
    });

    it('이미 가입된 이메일로 재가입하면 409를 반환한다', async () => {
      const { body } = await request(app.getHttpServer())
        .post('/auth/register')
        .send({ email: testEmail, password: testPassword })
        .expect(409);

      expect(body.code).toBe('EMAIL_ALREADY_EXISTS');
    });

    it('비밀번호가 8자 미만이면 400을 반환한다', async () => {
      await request(app.getHttpServer())
        .post('/auth/register')
        .send({ email: `short-${Date.now()}@example.com`, password: '123' })
        .expect(400);
    });
  });

  describe('POST /auth/login → 인증 필요 엔드포인트 → refresh → logout', () => {
    it('로그인 → 인증 필요 API 호출 → refresh → logout 전체 흐름이 성공한다', async () => {
      // 1. 로그인
      const loginRes = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: testEmail, password: testPassword })
        .expect(200);

      const { accessToken, refreshToken } = loginRes.body.data;
      expect(accessToken).toBeDefined();
      expect(refreshToken).toBeDefined();

      // 2. 인증 없이 로그아웃 시도 → 401
      await request(app.getHttpServer()).post('/auth/logout').expect(401);

      // 3. refresh로 새 토큰 발급 — refreshToken은 Authorization 헤더로만 전달
      const refreshRes = await request(app.getHttpServer())
        .post('/auth/refresh')
        .set('Authorization', `Bearer ${refreshToken}`)
        .expect(200);

      const newAccessToken = refreshRes.body.data.accessToken;
      expect(newAccessToken).toBeDefined();

      // 4. 새 accessToken으로 로그아웃
      await request(app.getHttpServer())
        .post('/auth/logout')
        .set('Authorization', `Bearer ${newAccessToken}`)
        .expect(204);

      // 5. 로그아웃된 accessToken 재사용 시 401 (블랙리스트)
      await request(app.getHttpServer())
        .post('/auth/logout')
        .set('Authorization', `Bearer ${newAccessToken}`)
        .expect(401);
    });

    it('잘못된 비밀번호로 로그인하면 401을 반환한다', async () => {
      const { body } = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: testEmail, password: 'wrong-password' })
        .expect(401);

      expect(body.code).toBe('INVALID_CREDENTIALS');
    });
  });
});
