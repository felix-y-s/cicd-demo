import { ClassSerializerInterceptor, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import { AppModule } from '../../src/app.module.js';

/**
 * E2E 테스트용 앱 부트스트랩.
 * main.ts와 동일한 전역 파이프라인을 구성해 실제 운영 동작과 일치시킨다.
 * HttpExceptionFilter/TransformInterceptor는 AppModule의 APP_FILTER/
 * APP_INTERCEPTOR 프로바이더로 이미 등록되어 있으므로 여기서 다시
 * 등록하지 않는다.
 */
export async function createTestApp(): Promise<INestApplication> {
  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleFixture.createNestApplication();

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalInterceptors(
    new ClassSerializerInterceptor(app.get(Reflector)),
  );

  await app.init();
  return app;
}
