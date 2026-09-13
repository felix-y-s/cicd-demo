# nest-template

NestJS 프로젝트를 새로 시작할 때 반복적으로 구성하는 보일러플레이트를 미리 갖춰둔 템플릿 저장소입니다. 이 저장소를 그대로 복제해 새 프로젝트의 시작점으로 사용합니다.

## 포함된 기능

- **환경설정**: `@nestjs/config` + `joi` — 환경변수 구조화 및 앱 기동 시 유효성 검증
- **응답 포맷 통일**: `TransformInterceptor` + `HttpExceptionFilter` — 모든 성공/에러 응답을 `{ success, statusCode, data, timestamp, path }` 계약으로 통일 (204는 예외)
- **로깅**: Winston — 파일 로테이션, 민감정보 마스킹, HTTP 요청/응답 자동 로깅
- **예외 처리**: 도메인 커스텀 예외 클래스 + 전역 `HttpExceptionFilter` — 응답 스키마 통일, Prisma 에러 자동 변환
- **데이터베이스**
  - PostgreSQL (Prisma) — 메인 DB, Repository 패턴
  - MongoDB (Mongoose) — 비정형·이력성 데이터용
- **인증**: JWT Access/Refresh 토큰, 로그아웃 시 Access 블랙리스트(Redis) + Refresh DB 삭제
- **캐시/세션**: Redis (ioredis)
- **메시지 큐**: RabbitMQ (amqplib) — 이벤트 발행/구독(로컬 + 분산)
- **Rate Limiting**: `@nestjs/throttler` — 3단계 프로파일(short/medium/long), Redis 저장소로 다중 인스턴스 공유
- **API 문서화**: Swagger (OpenAPI)
- **페이지네이션**: 오프셋 기반 공통 유틸 + Swagger 제네릭 응답
- **예시 도메인**: `posts`(Prisma), `activity-logs`(MongoDB) — 실제 CRUD와 위 기능들의 연동 방식을 코드로 확인 가능

## 기술 스택

| 영역 | 기술 |
|------|------|
| 프레임워크 | NestJS 12 |
| 언어 | TypeScript (ESM) |
| 패키지 매니저 | pnpm |
| RDB | PostgreSQL + Prisma 7 |
| NoSQL | MongoDB + Mongoose |
| 캐시 | Redis (ioredis) |
| 메시지 큐 | RabbitMQ |
| 인증 | Passport + JWT |
| 테스트 | Vitest + Supertest |
| 린트/포맷 | oxlint + Prettier |

## 시작하기

### 1. 의존성 설치

```bash
pnpm install
```

`postinstall`에서 `prisma generate`가 자동 실행됩니다.

### 2. 인프라 기동

Docker Compose로 PostgreSQL / MongoDB / Redis / RabbitMQ를 한 번에 띄웁니다.

```bash
docker compose up -d
docker compose ps   # 4개 서비스 모두 healthy 상태 확인
```

| 서비스 | 포트 | 접속 정보 |
|--------|------|-----------|
| PostgreSQL | 5432 | `nest` / `nest` / `nest_template` |
| MongoDB | 27017 | `nest` / `nest` / `nest_template` |
| Redis | 6379 | password: `nest` |
| RabbitMQ | 5672 (AMQP), 15672 (관리 UI) | `nest` / `nest` |

RabbitMQ 관리 UI: http://localhost:15672

### 3. 환경변수 설정

```bash
cp .env.example .env
```

`.env.example`의 기본값은 위 Docker Compose 설정과 그대로 맞춰져 있어 로컬 개발은 별도 수정 없이 바로 동작합니다. `JWT_SECRET`, `JWT_REFRESH_SECRET`는 운영 환경에서 반드시 32자 이상의 값으로 교체하세요.

### 4. 데이터베이스 마이그레이션

```bash
npx prisma migrate dev
```

### 5. 앱 실행

```bash
pnpm start:dev
```

- API 서버: http://localhost:3000
- Swagger UI: http://localhost:3000/api-docs

## 스크립트

```bash
pnpm start:dev      # 개발 서버 (watch 모드)
pnpm build          # 프로덕션 빌드
pnpm start:prod     # 빌드 결과 실행

pnpm test           # 단위/통합 테스트
pnpm test:e2e       # E2E 테스트 (인프라 필요)
pnpm test:cov       # 커버리지 포함 테스트

pnpm lint           # oxlint
pnpm format         # Prettier
```

## 프로젝트 구조

```
src/
├── common/                   # 도메인에 속하지 않는 공통 기능
│   ├── events/                 # 이벤트 타입, 발행 서비스(EventPublisherService), EventsModule
│   ├── exception/               # 커스텀 예외 클래스, ErrorCode enum
│   ├── logging/                  # HTTP 로깅 인터셉터
│   ├── pagination/                # 페이지네이션 DTO/유틸/Swagger 데코레이터
│   ├── response-format/           # TransformInterceptor, HttpExceptionFilter, @SkipTransform(), Response<T> — 전역 응답 포맷 통일
│   ├── swagger/                    # 공통 Swagger 응답 데코레이터
│   └── throttler/                   # Rate Limiting 커스텀 가드
├── config/                    # 환경변수(configuration.ts), joi 검증 스키마, Winston 설정
├── database/                  # 인프라 연결 모듈
│   ├── mongodb/
│   ├── prisma/
│   └── redis/
├── rabbitmq/                  # RabbitMQ 연결/채널 관리
├── modules/                   # 도메인 모듈
│   ├── auth/                    # 회원가입/로그인/재발급/로그아웃
│   ├── users/                    # 사용자 Repository
│   ├── posts/                    # 예시 도메인 (Prisma) — 이벤트 발행 연동 포함
│   └── activity-logs/            # 예시 도메인 (MongoDB)
├── app.module.ts
└── main.ts
prisma/
└── schema.prisma
test/
├── auth.e2e-spec.ts
├── posts.e2e-spec.ts
└── utils/create-test-app.ts   # E2E용 앱 부트스트랩 헬퍼
docker-compose.yml             # 로컬 인프라 4종
```

## 새 도메인 추가하기

`posts`(Prisma) 또는 `activity-logs`(MongoDB) 모듈을 참고해 아래 패턴을 따릅니다.

1. `prisma/schema.prisma`에 모델 추가 후 `npx prisma migrate dev --name add_{domain}` (Mongo는 `schemas/{domain}.schema.ts`에 `@Schema` 클래스 정의)
2. `dto/`에 Create/Update/Response DTO 작성 (`@ApiProperty`, `class-validator` 데코레이터 포함)
3. `repositories/{domain}.repository.ts` — DB 접근만 담당
4. `{domain}.service.ts` — 비즈니스 로직, 필요 시 `EventPublisherService.emitAll()`로 이벤트 발행
5. `{domain}.controller.ts` — `@ApiTags`, `@ApiBearerAuth('access-token')`, 공개 엔드포인트는 `@Public()`
6. `{domain}.module.ts`를 `app.module.ts`에 등록

인증이 필요 없는 엔드포인트에는 `@Public()`을 붙이세요. 전역 `JwtAuthGuard`가 기본적으로 모든 요청에 인증을 요구합니다.

## 인증 흐름

```
POST /auth/register  → 회원가입 + 자동 로그인 (accessToken, refreshToken 발급)
POST /auth/login      → 로그인
POST /auth/refresh    → refreshToken으로 재발급 (Authorization 헤더에 refreshToken 사용)
POST /auth/logout     → accessToken 블랙리스트 등록 + refreshToken DB 삭제
```

로그아웃은 Access Token(Redis 블랙리스트, `jti` 기준)과 Refresh Token(DB의 `refreshTokenHash` 삭제)을 모두 즉시 무효화합니다.

## curl로 전체 기능 테스트

`pnpm start:dev`로 앱이 떠 있고 `docker compose up -d`로 인프라가 기동된 상태를 가정합니다.

모든 성공 응답은 `{ success, statusCode, data, timestamp, path }`로 감싸져 있으므로, 아래 예시에서 실제 값은 응답의 `data` 필드 안에 있습니다 (예: `accessToken` → `data.accessToken`). 에러 응답은 `{ success: false, statusCode, code, message, timestamp, path }` 형태이며 `code`는 최상위 필드입니다. 204 No Content 응답은 예외적으로 래핑 없이 바디가 비어 있습니다.

아래 순서를 그대로 따르세요 — 로그아웃(5번)을 하면 `$ACCESS_TOKEN`이 즉시 블랙리스트에 등록되어 이후 인증이 필요한 요청에 재사용할 수 없습니다. posts/activity-logs 테스트는 로그아웃 **전에** 끝내야 합니다.

### 1. 회원가입 / 로그인

```bash
# 회원가입 (자동 로그인, accessToken/refreshToken 발급)
curl -s -X POST http://localhost:3000/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password123!"}'

# 응답의 data.accessToken / data.refreshToken을 아래 변수에 채워 넣고 이후 명령에 사용
ACCESS_TOKEN="<응답의 data.accessToken>"
REFRESH_TOKEN="<응답의 data.refreshToken>"

# 로그인 (이미 가입된 계정) — 새 토큰 쌍이 발급되므로 필요하면 위 변수를 갱신
curl -s -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password123!"}'
```

### 2. posts (Prisma CRUD + 페이지네이션 + RabbitMQ 이벤트)

```bash
# 생성 — PostCreatedEvent가 RabbitMQ로 발행되고 콘솔 로그에 Consumer 수신 기록이 남는다
curl -s -X POST http://localhost:3000/posts \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"title":"첫 번째 게시글입니다","content":"게시글 본문 내용입니다."}'

POST_ID="<응답의 data.id>"

# 목록 조회 — 공개 엔드포인트(@Public), 인증 없이도 200, page/limit 페이지네이션
curl -s "http://localhost:3000/posts?page=1&limit=10"

# 단건 조회 — 공개 엔드포인트(@Public)
curl -s "http://localhost:3000/posts/$POST_ID"

# 수정 — 작성자 본인만 가능
curl -s -X PATCH "http://localhost:3000/posts/$POST_ID" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"title":"수정된 제목"}'

# 삭제 — 작성자 본인만 가능
curl -s -X DELETE "http://localhost:3000/posts/$POST_ID" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

### 3. activity-logs (MongoDB CRUD)

```bash
# 기록 — 요청자 본인 명의로 활동 로그 생성
curl -s -X POST http://localhost:3000/activity-logs \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"action":"post.created","metadata":{"postId":"post-1","title":"첫 게시글"}}'

LOG_ID="<응답의 data.id>"

# 내 활동 로그 목록 조회 (최신순, 페이지네이션)
curl -s "http://localhost:3000/activity-logs?page=1&limit=10" \
  -H "Authorization: Bearer $ACCESS_TOKEN"

# 단건 조회 — 본인 소유 로그만 조회 가능 (IDOR 방지, 인증 필요)
curl -s "http://localhost:3000/activity-logs/$LOG_ID" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

### 4. Rate Limiting (429 확인)

`posts` 생성은 `medium` 프로파일(`.env.example` 기본값: 10초당 20회, `THROTTLE_MEDIUM_TTL`/`THROTTLE_MEDIUM_LIMIT`)이 적용되어 있습니다. 짧은 시간에 반복 호출하면 429가 발생합니다.

```bash
for i in $(seq 1 25); do
  curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:3000/posts \
    -H "Authorization: Bearer $ACCESS_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"title":"부하 테스트","content":"rate limit 확인용"}'
done
```

### 5. Access Token 재발급 / 로그아웃

여기서부터는 `$ACCESS_TOKEN`이 무효화되므로 위 2·3·4번 테스트를 먼저 끝낸 뒤 진행하세요.

```bash
# Access Token 재발급 (refreshToken은 Authorization 헤더로만 전달)
curl -s -X POST http://localhost:3000/auth/refresh \
  -H "Authorization: Bearer $REFRESH_TOKEN"

# 로그아웃 (accessToken 블랙리스트 등록 + refreshToken DB 삭제)
curl -s -X POST http://localhost:3000/auth/logout \
  -H "Authorization: Bearer $ACCESS_TOKEN"

# 로그아웃 후 같은 accessToken으로 재요청하면 401 확인
# (GET /posts는 @Public()이라 인증을 타지 않으므로 확인용으로 쓸 수 없다 — 인증이 실제로 걸리는 엔드포인트로 확인한다)
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/activity-logs \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

## 라이선스

UNLICENSED
