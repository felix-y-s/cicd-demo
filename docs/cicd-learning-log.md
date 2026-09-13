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

## 2단계: (예정)

---

## 3단계: (예정)

---

## 4단계: (예정)

---

## 5단계: (예정)
