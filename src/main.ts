import { NestFactory, Reflector } from '@nestjs/core';
import { ClassSerializerInterceptor, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { AppModule, ObserveInstrument } from './app.module.js';
import { LoggingInterceptor } from './common/logging/logging.interceptor.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    instrument: ObserveInstrument,
    bufferLogs: true, // Winston 준비 전 발생하는 초기 로그 손실 방지
  });

  const logger = app.get(WINSTON_MODULE_NEST_PROVIDER);
  app.useLogger(logger); // NestJS 기본 로거를 Winston으로 교체
  app.useGlobalInterceptors(new LoggingInterceptor(logger));
  // HttpExceptionFilter, TransformInterceptor는 app.module.ts에서
  // APP_FILTER/APP_INTERCEPTOR 프로바이더로 등록한다 (Reflector 등 DI 필요).
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // DTO에 없는 필드는 제거
      forbidNonWhitelisted: true, // DTO에 없는 필드가 있으면 400
      transform: true, // 평문 body를 DTO 클래스 인스턴스로 변환
    }),
  );
  // @Exclude()/@Expose()/@Transform() 등 class-transformer 데코레이터 활성화
  app.useGlobalInterceptors(
    new ClassSerializerInterceptor(app.get(Reflector)),
  );

  const configService = app.get(ConfigService);
  if (configService.get<boolean>('swagger.enabled')) {
    const swaggerPath = configService.get<string>('swagger.path') as string;
    const config = new DocumentBuilder()
      .setTitle('NestJS Template API')
      .setDescription('nest-template 보일러플레이트 API 문서')
      .setVersion('1.0')
      .addTag('auth', '인증 (회원가입/로그인/재발급/로그아웃)')
      // JWT 인증 헤더 등록 — @ApiBearerAuth('access-token')과 name이 일치해야 함
      .addBearerAuth(
        {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          name: 'JWT',
          description: 'JWT 액세스 토큰을 입력하세요 (Bearer 제외)',
          in: 'header',
        },
        'access-token',
      )
      // 토큰 재발급 엔드포인트 전용
      .addBearerAuth(
        {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          name: 'JWT Refresh',
          description: 'JWT 리프레시 토큰을 입력하세요 (Bearer 제외)',
          in: 'header',
        },
        'refresh-token',
      )
      .build();

    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup(swaggerPath, app, document, {
      swaggerOptions: {
        persistAuthorization: true, // 새로고침 시 JWT 토큰 유지
        tagsSorter: 'alpha',
        operationsSorter: 'alpha',
      },
    });
  }

  await app.listen(process.env.PORT ?? 3000);
}
await bootstrap();
