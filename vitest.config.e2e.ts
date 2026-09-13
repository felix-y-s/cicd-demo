import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    root: './',
    include: ['**/*.e2e-spec.ts'],
    // E2E는 실제 Rate Limiting(Redis 공유 카운터)이 걸려있는 같은 서버에
    // 여러 테스트 파일이 동시에 요청을 보내면 429가 섞여 나온다 —
    // 파일 단위로 순차 실행해 실제 운영과 동일한 단일 클라이언트처럼 동작시킨다.
    fileParallelism: false,
  },
});
