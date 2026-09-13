import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/database/prisma/prisma.service.js';
import { createTestApp } from './utils/create-test-app.js';

describe('Posts (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let accessToken: string;
  let otherAccessToken: string;
  const email = `e2e-posts-${Date.now()}@example.com`;
  const otherEmail = `e2e-posts-other-${Date.now()}@example.com`;
  const password = 'password123';

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);

    const registerRes = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email, password });
    accessToken = registerRes.body.data.accessToken;

    const otherRes = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email: otherEmail, password });
    otherAccessToken = otherRes.body.data.accessToken;
  });

  afterAll(async () => {
    await prisma.post.deleteMany({
      where: { author: { email: { in: [email, otherEmail] } } },
    });
    await prisma.user.deleteMany({ where: { email: { in: [email, otherEmail] } } });
    await app.close();
  });

  describe('사용자 시나리오: 생성 → 목록 조회 → 단건 조회 → 수정(권한) → 삭제', () => {
    it('게시글의 전체 생애주기가 정상 동작한다', async () => {
      // 1. 생성 (인증 필요)
      const createRes = await request(app.getHttpServer())
        .post('/posts')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ title: 'E2E 게시글', content: 'E2E 본문' })
        .expect(201);

      const postId = createRes.body.data.id;
      expect(postId).toBeDefined();
      expect(createRes.body.data.title).toBe('E2E 게시글');

      // 2. 목록 조회 (공개, 인증 불필요)
      const listRes = await request(app.getHttpServer())
        .get('/posts?page=1&limit=10')
        .expect(200);

      expect(
        listRes.body.data.items.some((p: { id: string }) => p.id === postId),
      ).toBe(true);
      expect(listRes.body.data.meta.total).toBeGreaterThanOrEqual(1);

      // 3. 단건 조회 (공개)
      const getRes = await request(app.getHttpServer())
        .get(`/posts/${postId}`)
        .expect(200);
      expect(getRes.body.data.title).toBe('E2E 게시글');

      // 4. 다른 사용자가 수정 시도 → 403
      const forbiddenRes = await request(app.getHttpServer())
        .patch(`/posts/${postId}`)
        .set('Authorization', `Bearer ${otherAccessToken}`)
        .send({ title: '해킹 시도' })
        .expect(403);
      expect(forbiddenRes.body.code).toBe('POST_FORBIDDEN');

      // 5. 작성자 본인이 수정
      const updateRes = await request(app.getHttpServer())
        .patch(`/posts/${postId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ title: '수정된 E2E 게시글' })
        .expect(200);
      expect(updateRes.body.data.title).toBe('수정된 E2E 게시글');

      // 6. 다른 사용자가 삭제 시도 → 403
      await request(app.getHttpServer())
        .delete(`/posts/${postId}`)
        .set('Authorization', `Bearer ${otherAccessToken}`)
        .expect(403);

      // 7. 작성자 본인이 삭제
      await request(app.getHttpServer())
        .delete(`/posts/${postId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(204);

      // 8. 삭제 후 조회 시 404
      await request(app.getHttpServer()).get(`/posts/${postId}`).expect(404);
    });
  });

  describe('POST /posts', () => {
    it('인증 없이 생성 시도하면 401을 반환한다', async () => {
      await request(app.getHttpServer())
        .post('/posts')
        .send({ title: '제목', content: '내용' })
        .expect(401);
    });

    it('필수 필드 누락 시 400을 반환한다', async () => {
      await request(app.getHttpServer())
        .post('/posts')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ title: '제목만 있음' })
        .expect(400);
    });
  });
});
