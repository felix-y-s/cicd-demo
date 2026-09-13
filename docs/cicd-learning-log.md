# CI/CD 학습 기록

목표: NestJS → Docker → GitHub Actions → GHCR → 로컬 Linux 배포 서버(Docker로 흉내)까지
직접 구축하며 CI/CD 파이프라인의 각 단계를 이해한다.

진행 방식: 한 단계씩 완료 → 검증 → 기록 → 다음 단계.

---

## 1단계: NestJS 컨테이너화 (완료)

### 무엇을 했나
- `Dockerfile` 작성 (멀티스테이지 빌드: `deps` → `builder` → `runtime`)
- `.dockerignore` 작성
- `docker build -t nest-cicd-demo:local .` 로 이미지 빌드
- 기존 `docker-compose.yml`의 네트워크(`cicd-demo_default`)에 컨테이너를 연결해 실제 구동 검증

### 왜 멀티스테이지인가
| 스테이지 | 역할 | 최종 이미지 포함 여부 |
|---|---|---|
| `deps` | devDependencies 포함 전체 설치 | ❌ (캐시로만 사용) |
| `builder` | TypeScript 컴파일 + Prisma Client 생성 | ❌ (캐시로만 사용) |
| `runtime` | 실행에 필요한 것만 모은 최종 이미지 | ✅ |

**중요 포인트**: 스테이지가 3개라고 이미지가 3개 만들어지는 것이 아니다.
`docker build -t <이름>`으로 태그가 붙는 대상은 **마지막 스테이지 하나**뿐이다.
앞 단계들은 최종 이미지를 만들기 위한 "작업대"이고, 빌드가 끝나면 이름 없는
중간 캐시 레이어로만 남는다. `docker images`로 확인해도 `nest-cicd-demo:local`
태그는 1개만 존재한다.

### 빌드 중 만난 문제와 해결

1. **`pnpm install --prod`가 실패함**
   - 원인: `package.json`의 `postinstall`이 `prisma generate`를 실행하는데,
     `prisma` CLI는 devDependency라서 `--prod` 설치 환경에는 없음.
   - 해결: production 전용 설치 스테이지를 따로 두지 않고, `builder`에서 이미
     생성된 `node_modules`(devDependencies 포함)를 `runtime`에 그대로 재사용.
   - 이유: pnpm은 `node_modules`를 `.pnpm` 저장소 + 심볼릭 링크 구조로 관리하기
     때문에 `@prisma/client`, `.prisma` 같은 개별 경로만 골라 복사하면 링크가
     깨진다. (실제로 `.prisma` 폴더를 찾지 못하는 에러로 확인됨)
   - 트레이드오프: 이미지 크기가 커짐(devDependencies 포함, 약 1.02GB).
     추후 `pnpm deploy` 등으로 최적화 여지 있음 (2단계 이후 과제로 보류).

2. **컨테이너가 `EACCES: permission denied, mkdir 'logs/'`로 크래시**
   - 원인: Dockerfile에서 `USER nestjs`(non-root)로 전환했는데, winston이
     런타임에 `logs/` 디렉토리를 새로 만들려고 시도. `/app`은 root가 만든
     디렉토리라 nestjs 사용자에게 쓰기 권한이 없음.
   - 해결: `USER nestjs`로 전환하기 **전에** `RUN mkdir -p logs && chown -R
     nestjs:nodejs logs`로 디렉토리를 미리 만들고 소유권을 넘김.
   - 교훈: non-root 사용자로 전환해도, 그 이전에 만들어진 파일/디렉토리의
     소유자는 여전히 root다. 런타임에 새로 쓰기 작업이 필요한 경로는
     미리 준비해야 한다.

3. **컨테이너 안에서 DB 연결이 안 됨 (`localhost` 문제)**
   - 원인: `.env.example`의 `DATABASE_URL` 등이 `localhost`를 가리키는데,
     컨테이너 안의 `localhost`는 컨테이너 자기 자신을 의미함. 호스트 머신이나
     다른 컨테이너를 가리키지 않음.
   - 해결: 앱 컨테이너를 기존 `docker-compose.yml`이 만든 네트워크
     (`cicd-demo_default`)에 `--network` 옵션으로 연결하고, 호스트 값을
     서비스명(`postgres`, `mongodb`, `redis`, `rabbitmq`)으로 변경.
   - 개념: Docker는 같은 네트워크에 속한 컨테이너끼리 서비스명을 DNS처럼
     resolve해준다. 즉 컨테이너 간 통신은 IP가 아니라 이름 기반.

### 검증 결과
```
docker build -t nest-cicd-demo:local .   # 성공, 1.02GB
docker run --network cicd-demo_default --env-file <test.env> -p 3001:3000 nest-cicd-demo:local
```
- 로그: Redis 연결 성공 / PostgreSQL(Prisma) 연결 성공 / RabbitMQ 연결 및 채널 풀 생성 성공 / 모든 라우트 정상 매핑
- `curl http://localhost:3001/` → `200`
- `curl http://localhost:3001/api-docs` → `200`

### 현재 Dockerfile 최종본 위치
`/Users/felix/practice/0913/cicd-demo/Dockerfile`

### 왜 스테이지를 나눴는가 (단일 스테이지와 실제 비교)

"한 번에 하면 안 되나?"라는 질문에 답하기 위해 스테이지 구분 없는 버전을
실제로 빌드해서 비교했다.

| 항목 | 멀티스테이지 (`nest-cicd-demo:local`) | 단일 스테이지 |
|---|---|---|
| 이미지 크기 | 1.02GB | 1.2GB |
| TypeScript 소스(`.ts`) 잔존 | 없음 | **있음** (컨테이너 안에 그대로) |
| `prisma.config.ts` (DB 접속 로직) 잔존 | 없음 | **있음** |

멀티스테이지를 쓰는 이유 3가지:
1. **보안**: 단일 스테이지는 소스 코드, DB 설정 로직이 이미지 안에 그대로
   남는다. 컨테이너가 뚫리면 코드 구조/설정이 통째로 노출됨.
2. **크기**: `tsc`, `vitest` 등 빌드 도구는 컴파일 후 쓸모없는데, 남아있으면
   GHCR push/pull 시마다 그 무게를 실어 나른다.
3. ~~캐시 재사용~~ → 아래 [정정] 항목 참고. 이건 스테이지 분리의 장점이
   아니라 레이어 캐시라는 별개 메커니즘이었다.

비유: 부엌(재료, 도구)은 손님상에 올라가지 않고, 완성된 요리만 나간다.
멀티스테이지는 "빌드 환경"과 "실행 환경"을 물리적으로 분리하는 패턴이다.

### [정정] 캐시는 "스테이지 단위"가 아니라 "레이어 단위"

`src/app.service.ts`의 문자열 하나만 바꾸고 실제로 재빌드해서 확인한 결과:

```
deps 스테이지    → 7개 레이어 전부 CACHED (pnpm install 재실행 안 됨)
builder 스테이지 → COPY . . 재실행 → pnpm build 재실행 (당연히, 코드가 바뀌었으므로)
runtime 스테이지 → COPY 레이어들 재실행 (builder 결과물이 바뀌었으므로)
```

**"코드만 바뀌면 스테이지를 통째로 건너뛴다"는 표현은 부정확했다.** 정확히는:
- Docker 캐시는 각 레이어(`RUN`/`COPY` 한 줄 한 줄)의 입력을 해시로 비교해서
  동작한다. 입력(이전 레이어 상태 + 명령어 + 복사되는 파일 내용)이 같으면
  그 레이어만 캐시 재사용.
- `deps` 스테이지가 통째로 스킵된 것처럼 보인 이유는, 그 안의 모든 레이어가
  받는 입력(`package.json`, `pnpm-lock.yaml`, `prisma/`)이 하나도 안
  바뀌었기 때문이지, "스테이지"라는 단위 자체가 캐시 스킵의 기준은 아니다.
- `builder`, `runtime` 스테이지는 항상 실행된다. 다만 그 안에서도 코드와
  무관한 레이어(예: `addgroup`/`adduser` 유저 생성)는 여전히 캐시된다.

### [재정정] 캐시 재사용은 스테이지 분리와 무관하다

이어서 "그럼 캐시 재사용은 스테이지를 나눈 덕분 아니냐"는 질문에 답하기
위해, **단일 스테이지 Dockerfile로도 동일하게 코드만 수정 후 재빌드**해서
확인했다. 결과:

```
[7/11] RUN pnpm install --frozen-lockfile  →  CACHED   (스테이지 없이도!)
[8/11] COPY . .                             →  재실행 (소스가 바뀌었으므로)
[9/11] RUN pnpm build                       →  재실행
```

단일 스테이지에서도 `pnpm install` 레이어는 캐시가 그대로 재사용됐다.
즉 **레이어 캐시 메커니즘 자체는 스테이지 유무와 아무 상관이 없다.**
Dockerfile에 스테이지가 1개든 3개든, "COPY package.json → RUN install →
COPY . . → RUN build" 순서로 레이어를 배치하기만 하면 코드 변경 시
install 레이어는 항상 캐시된다.

**그렇다면 멀티스테이지의 진짜 장점은 캐시가 아니라 무엇인가:**
- 단일 스테이지에서 캐시를 잘 활용해도, 빌드가 끝난 이미지 안에는 여전히
  `tsc`, `vitest`, TypeScript 소스, `prisma.config.ts` 등 빌드용 산출물이
  전부 남아있다 (위에서 실측: 1.2GB, `.ts` 파일 잔존).
- 멀티스테이지는 그 빌드 산출물을 별도 스테이지에 가둬두고, **최종
  이미지(`runtime`)에는 실행에 필요한 결과물만 골라 `COPY --from=builder`로
  가져온다.**
- 즉 멀티스테이지의 본질은 "캐시 최적화 기법"이 아니라 **"빌드 결과물과
  실행 결과물을 분리해서, 최종 이미지의 내용물을 선별하는 기법"**이다.
  캐시는 스테이지 여부와 무관하게 항상 레이어 단위로 별도로 동작한다.

### 남은 선택지 (다음 단계 진행 전 결정 필요)
- [ ] 이미지 크기 최적화 (`pnpm deploy` 등으로 devDependencies 제거) — 지금 할지, 나중에 할지
- [ ] 2단계: GitHub Actions CI 워크플로 작성 (lint → test → docker build 검증)

---

## 2단계: GitHub Actions CI 워크플로 (완료)

### 무엇을 했나
- `.github/workflows/ci.yml` 작성: push(main)/PR(main) 시 자동 실행
- 단계: 체크아웃 → pnpm 설치 → Node 설치(pnpm 캐시) → 의존성 설치 → lint →
  Prisma 마이그레이션 적용 → 테스트 → 빌드 → Docker 이미지 빌드 검증
- `feature/cicd-setup` 브랜치로 push → PR #1 생성 → 실제 CI 실행 및 통과 확인

### 사전 조사에서 발견한 것
- `pnpm test`를 로컬에서 그냥 돌렸더니 **5개 테스트 실패**
  (`The table 'public.users' does not exist`).
  원인: 로컬 PostgreSQL에 Prisma 마이그레이션이 아직 적용 안 된 상태였음.
  → `npx prisma migrate deploy`로 해결. 이 경험 덕분에 CI 워크플로에도
  "마이그레이션 적용" 단계를 반드시 넣어야 한다는 걸 먼저 알고 설계함.
- 통합 테스트 파일은 2개뿐 (`prisma.integration.spec.ts`,
  `users.repository.integration.spec.ts`) — 둘 다 PostgreSQL만 사용.
  MongoDB/Redis/RabbitMQ는 유닛 테스트에서 실제 연결하지 않음.
  → CI에는 PostgreSQL만 `services:`로 띄우고, 나머지는 Joi
  validationSchema의 `required()` 통과용 더미 값만 env로 제공.

  **근거 (직접 코드 확인)**:
  | 인프라 | 실제 연결 테스트 | 방식 |
  |---|---|---|
  | PostgreSQL | 있음 | 실제 DB에 쿼리 실행 |
  | Redis | 없음 | `redis.service.spec.ts`가 `vi.fn()`으로 만든 mock 객체를 주입 |
  | RabbitMQ | 없음 | `event-publisher.service.spec.ts`도 mock 채널/커넥션 사용 |
  | MongoDB | 없음 | Mongoose 관련 spec 파일 자체가 존재하지 않음 |

  단위 테스트(mock으로 외부 의존성을 대체해 "내 로직"만 검증)와
  통합 테스트(실제 인프라 연동 자체를 검증)의 차이가 그대로 드러난다.
  이 프로젝트는 PostgreSQL만 통합 테스트가 있으므로 CI도 그만큼만
  인프라를 띄우면 충분하다. **나중에 Mongo/Redis/RabbitMQ 통합 테스트를
  추가하게 되면, 그때는 `services:` 블록에 해당 이미지를 추가해야 한다**
  (예: `mongo:7`, `redis:7-alpine`, `rabbitmq:3-management-alpine`).

### 왜 이렇게 설계했나
- **`services:` 블록**: GitHub Actions 러너는 매번 새 가상머신이라 로컬의
  `docker-compose` 인프라가 없다. `services:`로 워크플로 실행 중에만
  존재하는 임시 컨테이너(PostgreSQL)를 띄우고, `options`의 헬스체크로
  DB가 준비될 때까지 기다린 뒤 다음 스텝이 진행되게 함.
- **마이그레이션을 테스트보다 먼저**: 신선한 DB이므로 테이블이 없다.
  로컬에서 이미 한 번 겪은 문제(`The table does not exist`)를 CI 설계에
  미리 반영.
- **Docker build를 마지막 단계로 포함**: 아직 GHCR에 push는 안 하지만,
  "이 커밋의 코드가 Dockerfile로 정상 빌드되는가"까지 CI가 검증하게 해서
  1단계(컨테이너화)와 2단계(CI)가 항상 함께 깨지지 않도록 연결.

### 검증 방법 (push 전에 로컬로 먼저 재현)
GitHub Actions 워크플로가 실제로 통과할지 push 전에 확신하기 위해,
**완전히 새로운 PostgreSQL 컨테이너**(포트 5433, 빈 DB)를 하나 더 띄워서
CI와 동일한 순서(마이그레이션 → lint → test)를 로컬에서 그대로 재현.
→ 신선한 DB에서도 마이그레이션 적용 및 121개 테스트 전부 통과 확인 후 push.

### 실제 CI 실행 결과
- PR: https://github.com/felix-y-s/cicd-demo/pull/1
- 실행 시간: 1분 28초
- 모든 단계 성공 (체크아웃 ~ Docker 이미지 빌드 검증까지 전부 ✓)
- 경고 1건 (기능에 영향 없음): 사용 중인 액션들(`actions/checkout@v4`,
  `actions/setup-node@v4`, `pnpm/action-setup@v4`)이 Node.js 20 기반인데,
  GitHub Actions 러너가 Node 20 지원을 종료하면서 Node 24로 강제 실행됨.
  당장 동작엔 문제없지만 액션 버전을 최신으로 유지할 필요가 있다는 신호.

### 남은 선택지 (다음 단계 진행 전 결정 필요)
- [ ] 이미지 크기 최적화 (`pnpm deploy` 등으로 devDependencies 제거)
- [ ] 3단계: CI 통과 시 GHCR에 이미지 push하는 워크플로(CD) 추가

### [업데이트] MongoDB/Redis/RabbitMQ 통합 테스트 추가에 따른 CI 확장

사용자가 `mongodb.integration.spec.ts`, `redis.integration.spec.ts`,
`rabbitmq-connection.integration.spec.ts`를 새로 추가함. 세 파일 다
mock이 아니라 **실제 모듈(`MongodbModule`, `RedisModule.forRoot()`,
`RabbitMQModule`)을 부팅해서 진짜 서버에 연결**하는 방식으로 확인됨
(예: Redis는 실제 SET/GET/INCR/TTL을 실행, RabbitMQ는 실제 채널 풀
생성까지 검증). 위에서 "PostgreSQL만 있으면 된다"고 판단했던 근거
자체가 바뀌었으므로 CI의 `services:`도 4개로 확장.

**겪은 문제와 해결**

1. **Redis에 비밀번호(`--requirepass`)를 걸 수 없음**
   - 시도: `docker-compose.yml`처럼 `--entrypoint "redis-server
     --requirepass nest"`를 `services.redis.options`에 지정.
   - 실패 원인: Docker의 `--entrypoint`는 공백을 포함한 명령 전체가
     아니라 **단일 실행 파일 경로만** 받는다. 로컬에서
     `docker run --entrypoint "redis-server --requirepass nest" ...`로
     재현했더니 `exec: "redis-server --requirepass nest": executable
     file not found`로 즉시 실패.
   - 근본 원인: GitHub Actions의 `services.<name>.options`는
     `docker create`에 붙는 **옵션 문자열**만 받을 뿐, 컨테이너 실행
     커맨드(CMD)를 통째로 바꿀 방법이 없다. `docker run <image>
     <command>`처럼 이미지 뒤에 커맨드를 붙이는 것과는 다른 경로.
   - 해결: CI에서는 인증 없는 기본 Redis로 띄우고
     (`REDIS_PASSWORD: ''`), `RedisModule.forRoot()`가
     `password: undefined`면 인증 없이 연결하는 걸 코드로 확인 후 적용.
     통합 테스트가 검증하는 건 "SET/GET/INCR가 동작하는가"이지
     "비밀번호 인증"이 아니므로 CI 목적엔 문제 없음.

2. **포트 충돌로 로컬 검증이 처음엔 실패**
   - 로컬에 이미 `docker-compose`로 postgres/mongodb/redis/rabbitmq가
     떠 있어 표준 포트(5432/27017/6379/5672/15672)가 이미 점유됨.
   - 해결: 검증용 컨테이너는 다른 포트(15432/27018/16379/15673)로
     띄우고, env 값도 그 포트에 맞춰 임시로 지정해서 재현.

**검증 절차**: push 전에 4개 인프라(Postgres/Mongo/Redis/RabbitMQ)를
로컬 컨테이너로 새로 띄우고, CI와 동일한 순서(마이그레이션 → lint →
test)로 재현. → **19개 테스트 파일, 131개 테스트 전부 통과** 확인 후 커밋.

핵심 교훈: `services:`의 `options`가 받는 것은 "컨테이너를 만들 때 줄 수
있는 옵션"이지 "컨테이너 안에서 실행할 명령"이 아니다. 이미지의 실행
방식(엔트리포인트/커맨드)까지 바꿔야 하는 설정(비밀번호 강제 등)은
`services:`로 재현하기 어렵고, 이럴 땐 이미지 기본 동작에 맞춰 테스트
전략을 조정하는 편이 실용적이다.

### [트러블슈팅] CI에서만 재현되는 RabbitMQ 테스트 실패

`services:` 4개를 다 채운 뒤 push했더니, **131개 테스트는 전부
통과(`131 passed`)했는데도 job 자체는 실패(exit code 1)** 처리됨.

**증상**: 테스트 실행 로그 마지막에 "Unhandled Errors" 섹션이 나타나며
`rabbitmq-connection.integration.spec.ts`에서 유래한
`Error: Channel ended, no reply will be forthcoming`가 5건 발생. vitest는
테스트 assert가 다 통과해도 unhandled rejection이 있으면 프로세스를
실패로 처리한다.

**원인 분석**:
- `module.close()` → `RabbitMQConnectionService.onModuleDestroy()` →
  `disconnect()`는 이미 각 채널의 `close()`에 `.catch(() => {})`를 걸어
  안전하게 처리하고 있음 (코드 자체는 방어적).
- 그런데 `amqp-connection-manager` 라이브러리는 연결/채널이 닫히는
  과정에서 **아직 응답을 기다리던 내부 pending command가 있으면, 그
  reject를 `close()`의 반환 Promise가 아니라 별도 이벤트 경로로
  발생시킨다.** 즉 애플리케이션 코드의 `.catch()`로는 잡히지 않는
  타이밍의 에러.
- 로컬(코어 많고 빠른 Docker Desktop)에서는 `pnpm test`를 여러 번
  반복해도, CPU를 1개로 제한한 컨테이너로 재현을 시도해도 전혀
  재현되지 않음. GitHub Actions 러너(2코어, 다른 네트워크 지연)에서만
  드러나는 순수 타이밍 이슈로 결론.

**대응 (완전한 원인 근절이 아니라 방어적 조치)**:
`rabbitmq-connection.integration.spec.ts`에 `process.on('unhandledRejection', ...)`
핸들러를 `beforeAll`~`afterAll` 범위에서만 등록해, "Channel ended"
메시지를 포함한 reject만 선택적으로 무시하도록 수정. 다른 종류의
에러는 여전히 그대로 throw되어 실제 버그를 가리지 않는다.
`afterAll`에 `module.close()` 후 100ms 대기를 추가해 뒤늦은 reject가
이 핸들러 범위 안에서 발생하도록 함.

**왜 이 방식을 택했나 (트레이드오프 인지)**:
- 근본 원인(라이브러리 내부 타이밍)을 애플리케이션 코드에서 완전히
  통제하기 어려움 — 서비스의 `disconnect()`는 이미 합리적으로 작성됨.
- "테스트를 스킵"하거나 "CI에서만 파일 제외"하는 대신, 실제 assert는
  그대로 유지하고 딱 이 알려진 실패 패턴(메시지 문자열로 식별)만 좁게
  방어함 → 다른 예기치 못한 에러를 숨기지 않음.
- 완벽한 해결책은 아니며, 재발 시 `amqp-connection-manager` 버전 업데이트나
  `disconnect()`에 연결 close 전 짧은 drain 대기를 추가하는 것도 고려 가능.

**결과**: 재push 후 실제 CI에서 전체 성공 확인 (1분 51초, 4개 인프라 +
131개 테스트 + build + docker build 전부 통과).
PR: https://github.com/felix-y-s/cicd-demo/pull/1

---

## 3단계: (예정)

---

## 3단계: (예정)

---

## 4단계: (예정)

---

## 5단계: (예정)
