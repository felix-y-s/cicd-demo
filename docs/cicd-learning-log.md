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

## 3단계: GHCR 이미지 배포 (완료)

### 무엇을 했나
- 기존 `.github/workflows/ci.yml`에 `push-ghcr` job 추가 (별도 cd.yml로
  분리하지 않고 같은 워크플로 안에서 `needs: test`로 연결)
- `test` job이 성공해야만 실행되고, `main` 브랜치로의 push에서만 실행
  (`if: github.event_name == 'push' && github.ref == 'refs/heads/main'`)
  → PR에서는 여전히 빌드 검증까지만 하고 실제 push는 안 함
- 태그 전략: `latest` + `sha-<7자리 커밋 해시>` 두 개 동시 부여
  (`docker/metadata-action`으로 자동 생성)

### 왜 이렇게 설계했나
- **`needs: test`**: "테스트를 통과한 코드만 배포 이미지가 된다"는 CI/CD의
  핵심 원칙을 GitHub Actions의 job 의존성으로 강제. test가 실패하면
  push-ghcr은 아예 실행되지 않는다(스킵).
- **GITHUB_TOKEN 사용**: GHCR push에 별도 PAT(Personal Access Token)을
  발급/등록할 필요 없이, 워크플로 실행마다 자동 발급되는 임시 토큰에
  `permissions.packages: write`만 선언하면 충분. Docker Hub 대비 GHCR이
  GitHub 프로젝트에서 다루기 쉬운 이유.
- **latest + sha 이중 태그**: `latest`는 배포 서버가 "최신 버전"을 pull할
  때 쓰고, `sha-*`는 특정 커밋 시점으로 롤백해야 할 때 쓴다.

### 검증 방법
GitHub Actions 러너 환경 자체는 로컬로 완전히 재현할 수 없어 push
전까지 100% 확신은 어렵지만, 워크플로가 실제로 하는 핵심 동작(멀티태그
Docker 빌드)은 로컬에서 재현 가능:
```
docker build -t ghcr.io/felix-y-s/cicd-demo:latest \
             -t ghcr.io/felix-y-s/cicd-demo:sha-test123 .
```
→ 정상 빌드 확인 후 커밋.

### 실제 push 결과 (PR#1 merge 후)
- `test`(1분 56초) → `push-ghcr`(3분 18초) 순서로 정상 실행, GHCR push 성공
- 예상과 달리 **패키지가 이미 public 상태**였음 (별도 설정 불필요했음)

### [트러블슈팅] arm64 환경에서 pull 실패

로컬(Apple Silicon Mac, arm64)에서 방금 push된 이미지를 pull해봤더니:
```
Error response from daemon: no matching manifest for linux/arm64/v8
in the manifest list entries: no match for platform in manifest: not found
```

**원인**: GitHub Actions의 `ubuntu-latest` 러너는 linux/amd64 아키텍처.
`docker/build-push-action`에 `platforms`를 지정하지 않으면 러너의
기본 아키텍처(amd64)로만 빌드되어, arm64 환경(Apple Silicon Mac 등)에서는
매니페스트에 맞는 이미지가 없어 pull이 거부된다.

**중요성**: 5단계(로컬 Linux 배포 서버)를 Mac 위 Docker 컨테이너로 만들
계획인데, 이 컨테이너도 결국 호스트인 Mac의 아키텍처(arm64)를 쓰게 되므로
이 문제를 미리 잡지 않으면 5단계에서 그대로 막히게 됨.

**해결**: `build-push-action`에 `platforms: linux/amd64,linux/arm64`를
추가하고, 크로스 컴파일에 필요한 `docker/setup-qemu-action`을 `setup-buildx-action`
앞에 추가. 이러면 하나의 태그 아래 두 아키텍처 이미지가 매니페스트
리스트로 묶여 push되고, pull하는 쪽의 아키텍처에 맞춰 자동 선택된다.

**부수적으로 발견한 것**: 처음 작성했던 액션 버전(`docker/login-action@v3`,
`metadata-action@v5`, `setup-buildx-action@v3`, `build-push-action@v6`)이
전부 실제로는 각 저장소의 최신 메이저가 아니었음. GitHub API로 태그
목록을 직접 조회해 최신 메이저(v4/v6/v4/v7)로 교체:
```
gh api repos/docker/build-push-action/tags --jq '.[].name' | grep -E '^v[0-9]+$'
```
IDE의 액션 버전 진단이 최신 태그를 "resolve 불가"로 표시했는데, 이는
IDE 확장의 캐시 지연이었고 GitHub API로 태그 존재를 직접 검증하여 확인.

### 최종 검증 (PR#2 merge 후)
- CI 전체 성공: `test`(1분 46초) → `push-ghcr`(4분 24초, QEMU 크로스
  빌드 포함이라 이전보다 오래 걸림)
- 로컬(Apple Silicon Mac, arm64)에서 실제 pull 성공:
  ```
  docker pull ghcr.io/felix-y-s/cicd-demo:latest
  docker inspect ... --format '{{.Architecture}}/{{.Os}}'  # → arm64/linux
  ```
- pull한 이미지로 컨테이너 기동 → 기존 인프라(postgres/mongodb/redis/
  rabbitmq)에 정상 연결 → `curl http://localhost:3002/` → `200` 확인.
  즉 "GitHub Actions가 빌드한 이미지가 실제 로컬 환경에서 그대로
  동작한다"는 배포 파이프라인의 핵심 전제를 검증 완료.

PR: https://github.com/felix-y-s/cicd-demo/pull/2

### 3단계 전체 요약
- GHCR push는 `GITHUB_TOKEN` + `permissions.packages: write`만으로 충분
  (별도 시크릿 불필요)
- 패키지는 예상과 달리 첫 push부터 이미 public 상태였음
- **크로스 플랫폼 배포를 고려한다면 `platforms` 지정은 선택이 아니라
  필수**임을 실제 실패로 체감. 무엇을 했는지:
  1. `.github/workflows/ci.yml`의 `push-ghcr` job에
     `docker/setup-qemu-action@v4` 스텝을 `setup-buildx-action` 앞에 추가
     (크로스 아키텍처 빌드에 필요한 에뮬레이션 활성화)
  2. `docker/build-push-action@v7`에 `platforms: linux/amd64,linux/arm64`
     옵션을 추가 (기본값은 러너와 같은 amd64 하나만 빌드됨)
  3. 재push 후 로컬(arm64 Mac)에서 `docker pull` → 성공, `docker inspect
     --format '{{.Architecture}}'` → `arm64` 확인
  → 결론: CI 러너와 배포 대상의 아키텍처가 다를 수 있다는 걸 놓치면
  "빌드는 성공했는데 배포 환경에서 pull이 안 되는" 상황이 생긴다.

### 개선 백로그 (지금 당장은 아니지만 기록해둘 것)
- [ ] `on.push`에 `paths-ignore: ['docs/**']`를 추가해, 문서만 바뀐
  커밋에서는 test/push-ghcr이 다시 돌지 않도록 하기. 지금은 `docs/`만
  고쳐도 이미지가 불필요하게 재빌드/재push됨 (실제로 이번 세션에서
  문서 수정 커밋 하나 때문에 GHCR push가 한 번 더 실행됨).

---

## 4단계: 로컬 Linux 배포 서버 구축 (완료)

### 이 단계에서 실제로 만든 파일 vs 터미널에서 직접 실행만 한 명령

**파일로 만들어서 git에 남길 것들** (`deploy-server/` 디렉토리):
- `deploy-server/Dockerfile` — "가짜 리눅스 서버" 이미지 정의
- `deploy-server/entrypoint.sh` — 컨테이너 시작 시 dockerd/sshd 기동 스크립트
- `deploy-server/authorized_keys` — SSH 접속을 허용할 공개키

**아직 파일(스크립트)로 안 만들고, 터미널에 직접 쳐서 "되는지 안 되는지"만
확인한 것** — 즉 지금은 자동화된 배포가 아니라 수동 리허설 단계다:
- 아래 "실제 실행 명령 전체 기록" 참고. 5단계에서 이걸 스크립트나
  GitHub Actions 워크플로로 옮겨 자동화할 예정.

### 실제 실행 명령 전체 기록 (재현 가능하도록 그대로 남김)

**1) 실습 전용 SSH 키 쌍 생성** (기존 개인 키와 분리, 최초 1회만)
```
ssh-keygen -t ed25519 -f ~/.ssh/cicd-demo-deploy -N "" -C "cicd-demo-deploy-practice"
cp ~/.ssh/cicd-demo-deploy.pub deploy-server/authorized_keys
```

**2) "가짜 서버" 이미지 빌드**
```
cd deploy-server
docker build -t local-linux-deploy-server .
```

**3) "가짜 서버" 컨테이너 실행** (SSH 포트를 호스트 2222번에 매핑)
```
docker run -d --name local-deploy-server --privileged \
  --add-host=host.docker.internal:host-gateway \
  -p 2222:22 \
  local-linux-deploy-server
```

**4) SSH로 실제 접속해서 확인** (여기서부터 "명령어 뒤에 붙는 문자열"이
전부 가짜 서버 안에서 실행됨)
```
ssh -i ~/.ssh/cicd-demo-deploy -p 2222 \
  -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null \
  deployer@localhost "echo 접속 성공; whoami; hostname"
# 결과: whoami → deployer, hostname → 06895f722a03 (가짜 서버 자신의 ID)
# → Mac이 아니라 가짜 서버 안에서 실행됐다는 증거

ssh ... deployer@localhost "docker --version && docker ps"
# → 가짜 서버 "안에" Docker가 설치되어 있고 정상 동작함을 확인
```

**5) 가짜 서버 안에서 또 다른 컨테이너(alpine)를 띄워보는 테스트** (overlay
에러 발견 → vfs로 수정 후 재검증, 아래 트러블슈팅 1 참고)
```
ssh ... deployer@localhost "docker run --rm alpine echo 중첩 컨테이너 실행 성공"
```

**6) DB 연결 경로 확인** (host.docker.internal 문제 진단, 트러블슈팅 2 참고)
```
ssh ... deployer@localhost "getent hosts host.docker.internal"
ssh ... deployer@localhost "docker run --rm --add-host=host.docker.internal:192.168.65.254 \
  alpine sh -c 'apk add --no-cache netcat-openbsd -q && nc -zv -w3 host.docker.internal 5432'"
```

**7) 실제 배포: GHCR에서 이미지 pull → NestJS 컨테이너 실행**
```
# env 파일을 SCP로 가짜 서버에 전송 (DB 접속 정보를 host.docker.internal로 지정)
scp -i ~/.ssh/cicd-demo-deploy -P 2222 deploy.env deployer@localhost:/home/deployer/app.env

ssh ... deployer@localhost "docker run -d --name nest-app \
  --add-host=host.docker.internal:192.168.65.254 \
  --env-file /home/deployer/app.env \
  -p 3000:3000 \
  ghcr.io/felix-y-s/cicd-demo:latest"

ssh ... deployer@localhost "docker logs nest-app"
# → PostgreSQL/RabbitMQ 연결 성공 로그 확인
```

**8) 외부(Mac)에서 최종 접근 확인** (SSH 터널, 트러블슈팅 3 참고)
```
ssh -i ~/.ssh/cicd-demo-deploy -p 2222 -f -N -L 3000:localhost:3000 deployer@localhost
curl http://localhost:3000/
# → HTTP 200
```

### 왜 Docker-in-Docker로 만들었나
실제 배포 서버는 "SSH로 접속해서, 그 서버의 Docker로 이미지를 pull/run"
하는 게 핵심 동작이다. 로컬에 진짜 VM이나 별도 리눅스 장비 없이 이
경험을 재현하려면, 컨테이너 안에 독립된 Docker 데몬을 하나 더 띄우는
Docker-in-Docker(DinD) 구조가 필요했다.

### [트러블슈팅 1] overlay 마운트 실패

`--privileged`로 배포 서버를 띄우고 그 안에서 `docker run alpine ...`을
실행하니:
```
failed to mount ... fstype: overlay ... err: invalid argument
```

**원인**: Mac Docker Desktop은 이미 리눅스 VM 위에서 동작하는데, 그 안에
또 격리된 Docker 데몬(overlay2 스토리지 드라이버 사용)을 얹으면 커널의
overlay 파일시스템 계층이 중첩 가상화 환경에서 꼬이는 경우가 있다
(Docker-in-Docker의 알려진 제약).

**해결**: `entrypoint.sh`에서 `dockerd --storage-driver=vfs`로 시작하도록
수정. vfs는 레이어를 하드링크 없이 통째로 복사하는 방식이라 속도는
느리지만 커널 의존성이 낮아 중첩 가상화에서도 안정적으로 동작한다.
재빌드 후 `docker run --rm alpine echo ...`가 정상 실행되는 것으로 확인.

### [트러블슈팅 2] 중첩 컨테이너에서 host.docker.internal이 엉뚱한 곳을 가리킴

DB 연결 테스트 중, nested 컨테이너(배포 서버 안에서 dockerd가 만든
컨테이너)에서 `--add-host=host.docker.internal:host-gateway`를 써도
PostgreSQL(호스트 Mac의 5432)에 연결이 안 됨.

**원인 분석 (단계별로 직접 검증)**:
1. 배포 서버 컨테이너 자신은 `host.docker.internal` → `192.168.65.254`
   (Mac)로 정상 resolve됨. `/dev/tcp` 체크로 5432 접속도 성공.
2. 그런데 그 안에서 `docker run`으로 만든 nested 컨테이너는
   `host.docker.internal` → `172.18.0.1`로 resolve됨. 이건 Mac이 아니라
   **nested dockerd가 만든 브릿지 네트워크의 게이트웨이, 즉 배포 서버
   컨테이너 자기 자신**이었음. `nc`로 5432 접속 시도 시 "Connection
   refused" (배포 서버 자신은 5432를 열고 있지 않으므로 당연한 결과).

**핵심 개념**: `host.docker.internal`은 Docker Desktop이 "자신이 직접
관리하는 최상위 컨테이너"에만 자동으로 심어주는 특수 DNS다. 그 컨테이너
안에서 또 dockerd가 컨테이너를 만들면, 그 dockerd는 그냥 평범한 Linux
Docker이므로 이 자동 매핑이 없다. `--add-host=...:host-gateway`도
"이 컨테이너가 속한 네트워크의 게이트웨이"를 가리킬 뿐이라, 중첩
단계마다 다른 대상을 가리키게 된다.

**해결**: nested 컨테이너 실행 시 `host.docker.internal`을 배포 서버가
확인한 실제 IP로 명시적으로 고정:
```
docker run --add-host=host.docker.internal:192.168.65.254 ...
```
이후 `nc -zv host.docker.internal 5432` → 성공 확인.

### [트러블슈팅 3] 포트 매핑이 중첩 단계마다 필요함

`nest-app`(nested 컨테이너)이 `-p 3000:3000`으로 자신을 배포 서버에
노출해도, Mac에서 `curl http://localhost:3000/`이 실패함
(`Exit code 7`, connection refused).

**원인**: 배포 서버 컨테이너 자체를 처음 띄울 때 `-p 2222:22`(SSH)만
열었고 `3000:3000`은 열지 않았음. 포트 노출은 각 중첩 레이어마다
독립적으로 필요하다 — nested 컨테이너의 포트가 배포 서버에 노출돼도,
배포 서버 자신의 포트가 Mac에 노출돼야 최종적으로 바깥에서 닿는다.

**해결**: 배포 서버 컨테이너 자체를 재기동하지 않고, 이미 열려 있는
SSH를 활용해 SSH 로컬 포트 포워딩으로 접근:
```
ssh -i ~/.ssh/cicd-demo-deploy -p 2222 -f -N -L 3000:localhost:3000 deployer@localhost
curl http://localhost:3000/   # → 200
```
실제 운영에서도 배포 서버의 내부 포트를 확인할 때 SSH 터널을 쓰는
경우가 흔해, 이 방식이 실습 목적에 맞다고 판단.

### 최종 검증된 전체 흐름
```
GHCR (이미지 저장소)
  → SSH로 배포 서버(컨테이너) 접속 (ssh -i ~/.ssh/cicd-demo-deploy -p 2222 deployer@localhost)
  → 배포 서버 안에서 docker pull ghcr.io/felix-y-s/cicd-demo:latest
  → docker run으로 컨테이너 기동
  → 그 컨테이너가 host.docker.internal(고정 IP)을 통해
    Mac 호스트의 PostgreSQL/MongoDB/Redis/RabbitMQ에 연결 성공
  → SSH 로컬 포트 포워딩으로 외부에서 최종 접근 확인 (HTTP 200)
```

### 남은 정리 작업
- [ ] `deploy-server/` 내용을 git에 커밋할지 결정 (실습용 인프라 코드이므로
  포함 여부와 위치 재검토 필요 — `authorized_keys`는 공개키만이라 안전)
- [ ] 5단계에서 이 배포 서버로 자동 배포(SSH + docker pull/run을 스크립트화
  또는 GitHub Actions에서 SSH로 원격 실행)를 구성할 예정

---

## 5단계: 배포 자동화 (완료)

### 목표
4단계에서 손으로 하나씩 실행했던 것(SSH 접속 → GHCR pull → docker run →
헬스체크)을, `main` push 시 GitHub Actions가 자동으로 실행하게 만든다.

### 핵심 문제: 클라우드 러너가 사설 IP에 도달할 수 없음
GitHub Actions의 기본 러너(`ubuntu-latest` 등)는 GitHub의 클라우드에서
실행되는데, 배포 서버(Mac 위 Docker 컨테이너, SSH 포트 2222)는 인터넷에
노출되지 않은 사설 네트워크에 있다. 클라우드 러너가 이 사설 IP로 직접
SSH 접속할 방법이 없다.

**선택한 해결책**: self-hosted runner — GitHub Actions 러너 프로그램을
이 Mac에 직접 설치해서, 워크플로의 특정 job이 "GitHub 클라우드"가 아니라
"이 Mac 자체"에서 실행되게 한다. 그러면 그 job 안에서는 `localhost:2222`로
배포 서버에 바로 SSH 접속할 수 있다.

(대안으로 ngrok/cloudflared 같은 터널을 배포 서버에 뚫어 클라우드 러너가
접근하게 하는 방법도 있음 — 별도로 정리 예정)

### 실제 실행 명령 (self-hosted runner 등록)
```
# 1. 러너 프로그램 다운로드 (arm64 Mac이므로 osx-arm64 패키지)
mkdir -p ~/actions-runner-cicd-demo && cd ~/actions-runner-cicd-demo
curl -o actions-runner-osx-arm64-2.337.0.tar.gz -L \
  https://github.com/actions/runner/releases/download/v2.337.0/actions-runner-osx-arm64-2.337.0.tar.gz
tar xzf ./actions-runner-osx-arm64-2.337.0.tar.gz

# 2. GitHub에서 임시 등록 토큰 발급 (1시간 유효)
gh api -X POST repos/felix-y-s/cicd-demo/actions/runners/registration-token --jq '.token'

# 3. 러너를 이 저장소에 등록
./config.sh --url https://github.com/felix-y-s/cicd-demo \
  --token <위에서 받은 토큰> \
  --name mac-local-runner \
  --labels self-hosted,macOS,local-deploy \
  --work _work --unattended

# 4. 러너 실행 (백그라운드, "Listening for Jobs" 상태가 되면 대기 완료)
nohup ./run.sh > runner.log 2>&1 &

# 5. 등록 확인
gh api repos/felix-y-s/cicd-demo/actions/runners --jq '.runners[] | {name, status}'
# → {"name":"mac-local-runner","status":"online"}
```

### SSH 개인키를 GitHub Secrets에 등록
워크플로가 어떤 러너에서 실행되든 동일하게 동작하도록(이식성), 로컬
파일을 직접 참조하지 않고 Secrets로 관리:
```
cat ~/.ssh/cicd-demo-deploy | gh secret set DEPLOY_SSH_PRIVATE_KEY --repo felix-y-s/cicd-demo
```

### 워크플로에 추가한 것 (`.github/workflows/ci.yml`)
`push-ghcr` job 뒤에 `deploy` job 추가:
- `runs-on: self-hosted`, `needs: push-ghcr` — GHCR push 성공 후에만 실행
- SSH 개인키를 Secrets에서 꺼내 임시 파일로 저장
- SSH로 배포 서버 접속 → `docker pull` → 기존 `nest-app` 컨테이너 제거 →
  새 이미지로 재기동 (4단계에서 손으로 쳤던 명령을 그대로 스크립트화)
- `curl`로 헬스체크
- `if: always()`로 개인키 임시 파일 정리 (성공/실패 무관하게 항상 실행)

### push 전 로컬 사전 검증
워크플로에 넣을 배포 스크립트를 실제로 터미널에서 먼저 실행해 재현 확인:
```
ssh -i ~/.ssh/cicd-demo-deploy -p 2222 \
  -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null \
  deployer@localhost bash -s <<'EOF'
  set -e
  docker pull ghcr.io/felix-y-s/cicd-demo:latest
  docker rm -f nest-app || true
  docker run -d --name nest-app \
    --add-host=host.docker.internal:192.168.65.254 \
    --env-file /home/deployer/app.env \
    -p 3000:3000 \
    ghcr.io/felix-y-s/cicd-demo:latest
EOF
# → 기존 컨테이너 제거 후 재기동 성공

sleep 5
ssh ... deployer@localhost "curl -sf http://localhost:3000/ > /dev/null && echo 배포 성공"
# → "배포 성공: 앱이 정상 응답함"
```

### 최종 검증 (PR#4 merge 후)
`main`에 push한 것만으로 전체 파이프라인이 완전 자동으로 이어짐:
```
test (1분 41초) → push-ghcr (2분 6초) → deploy (24초)
```
`deploy` job 로그: SSH 개인키 준비 → 이미지 pull/재기동 → 헬스체크
("배포 성공: 앱이 정상 응답함") → 개인키 정리, 전부 성공.

실제로 배포 서버에 접속해 컨테이너가 방금 갱신됐는지 직접 확인:
```
ssh -i ~/.ssh/cicd-demo-deploy -p 2222 deployer@localhost \
  "docker ps --filter name=nest-app --format '{{.Names}}: {{.Status}}'"
# → nest-app: Up 25 seconds   (GitHub Actions가 방금 재기동한 것)
```

PR: https://github.com/felix-y-s/cicd-demo/pull/4

### 5단계 전체 요약
- NestJS 코드를 `main`에 push하면: 테스트 → Docker 빌드 → GHCR push →
  로컬 배포 서버 SSH 접속 → 최신 이미지로 재기동 → 헬스체크까지
  **사람 개입 없이 자동으로** 끝난다. 4단계에서 손으로 검증했던 절차를
  그대로 자동화한 것.
- self-hosted runner가 "왜 필요했는지"가 이번 단계의 핵심 개념:
  GitHub 클라우드 러너는 사설 네트워크의 배포 서버에 도달할 수 없으므로,
  배포 서버와 같은 네트워크에 있는 컴퓨터(이 Mac)를 러너로 등록해야 했다.

### [관찰] self-hosted runner의 online/offline 불안정성

문서 커밋(`docs/deploy-alternatives-tunnel.md`)만 push했는데도 `main`
push 트리거로 전체 파이프라인이 다시 돌았고, 이때 `deploy` job이
5분 넘게 `queued` 상태로 멈춰 있었다. 원인 확인:
```
gh api repos/felix-y-s/cicd-demo/actions/runners --jq '.runners[] | {name, status, busy}'
# → {"busy":false,"name":"mac-local-runner","status":"offline"}
```
러너 프로세스(`run.sh`, `Runner.Listener`) 자체는 `ps aux`로 확인해보니
계속 살아있었고, 로그(`runner.log`)에도 직전 job까지는 정상 처리
기록이 있었다. 즉 프로세스가 죽은 게 아니라 GitHub 쪽에 상태가 잠깐
offline으로 잘못 보고된 것으로 보인다. 15초 후 재조회하니 다시
`"status":"online","busy":true`로 돌아왔고 `deploy` job도 정상 완료됨.

**교훈**: self-hosted runner를 `nohup`으로 띄워두는 방식은 GitHub과의
heartbeat 연결이 일시적으로 끊기면 `queued` 상태로 오래 대기할 수 있다.
지금은 재시도 없이 기다리니 자연 복구됐지만, 실무라면 러너를
systemd/launchd 서비스로 등록해 자동 재시작되게 하거나, GitHub이
제공하는 공식 서비스 등록 스크립트(`svc.sh install && svc.sh start`)를
쓰는 게 안정적이다. 지금은 학습 목적상 `nohup`으로 충분하다고 판단해
그대로 둠.

### 다음에 기록할 것 (남은 작업)
- [ ] self-hosted runner를 `nohup` 대신 launchd 서비스로 등록해 안정성
  높이기 (또는 실습이 끝나면 완전히 내리고 정리)
- [x] ngrok/cloudflared 터널 방식을 self-hosted runner의 대안으로
  별도 문서에 정리 (사용자 요청) → [docs/deploy-alternatives-tunnel.md](./deploy-alternatives-tunnel.md)
