# syntax=docker/dockerfile:1

# ---------- Stage 1: dependencies ----------
# devDependencies를 포함한 전체 의존성을 설치하는 단계 (빌드에만 사용, 최종 이미지에는 포함되지 않음)
FROM node:22-alpine AS deps
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@10.13.1 --activate

COPY package.json pnpm-lock.yaml ./
COPY prisma ./prisma
COPY prisma.config.ts ./

# --frozen-lockfile: lockfile과 package.json 불일치 시 빌드 실패 (재현 가능한 빌드 보장)
RUN pnpm install --frozen-lockfile

# ---------- Stage 2: build ----------
# TypeScript 컴파일 및 Prisma Client 생성 단계
FROM node:22-alpine AS builder
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@10.13.1 --activate

COPY --from=deps /app/node_modules ./node_modules
COPY . .

RUN pnpm build

# ---------- Stage 3: runtime ----------
# 실제 컨테이너로 배포되는 최종 이미지 (빌드 도구 없이 실행에 필요한 파일만 포함)
#
# pnpm은 node_modules를 .pnpm 저장소 + 심볼릭 링크 구조로 관리하기 때문에
# @prisma/client, .prisma 같은 개별 경로만 골라 복사하면 링크가 깨진다.
# 따라서 devDependencies가 섞여 있더라도 builder의 node_modules를 통째로 재사용한다
# (멀티스테이지 빌드로 최종 이미지에는 builder 자체가 남지 않으므로 크기 문제는 없다).
FROM node:22-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production

# non-root 사용자로 실행 (컨테이너 보안 관행)
RUN addgroup -g 1001 -S nodejs && adduser -S nestjs -u 1001

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/package.json ./package.json

# winston-daily-rotate-file이 런타임에 로그 디렉토리를 생성하므로
# non-root 사용자로 전환하기 전에 미리 만들고 소유권을 넘겨준다.
RUN mkdir -p logs && chown -R nestjs:nodejs logs

USER nestjs

EXPOSE 3000

CMD ["node", "dist/main"]
