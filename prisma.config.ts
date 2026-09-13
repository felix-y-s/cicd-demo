// prisma.config.ts 최상단에 반드시 위치해야 합니다.
// Prisma CLI는 이 파일을 .env 로드 전에 실행하므로, dotenv로 명시적으로 로드해야 합니다.
// (NestJS의 ConfigModule.forRoot()는 런타임 전용이며 CLI에는 적용되지 않습니다.)
import 'dotenv/config';
import path from 'path';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: path.join('prisma', 'schema.prisma'),
  datasource: {
    url: process.env.DATABASE_URL,
  },
});
