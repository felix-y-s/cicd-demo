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

# ---------- Stage 3: production dependencies ----------
# devDependencies 없이 런타임 전용 node_modules를 별도로 설치한다.
FROM node:22-alpine AS prod-deps
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@10.13.1 --activate

COPY package.json pnpm-lock.yaml ./
COPY prisma ./prisma
COPY prisma.config.ts ./

# postinstall(prisma generate)이 devDependency인 prisma CLI를 필요로 하므로,
# --ignore-scripts로 일단 설치를 마친 뒤 prisma CLI만 임시로 받아
# generate를 실행한다. dlx는 npm 캐시에서만 받아쓰고 node_modules에는
# 남기지 않으므로 최종 이미지 크기에 영향이 없다.
RUN pnpm install --frozen-lockfile --prod --ignore-scripts \
    && pnpm dlx prisma@7.10.0 generate

# ---------- Stage 4: runtime ----------
# 실제 컨테이너로 배포되는 최종 이미지 (빌드 도구 없이 실행에 필요한 파일만 포함)
FROM node:22-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production

# non-root 사용자로 실행 (컨테이너 보안 관행)
RUN addgroup -g 1001 -S nodejs && adduser -S nestjs -u 1001

COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/package.json ./package.json

# winston-daily-rotate-file이 런타임에 로그 디렉토리를 생성하므로
# non-root 사용자로 전환하기 전에 미리 만들고 소유권을 넘겨준다.
RUN mkdir -p logs && chown -R nestjs:nodejs logs

USER nestjs

EXPOSE 3000

CMD ["node", "dist/main"]
