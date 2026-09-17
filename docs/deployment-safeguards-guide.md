# 배포 안전장치 구현 가이드

[cicd-pipeline-flow.md](./cicd-pipeline-flow.md)에서 정리한 "지금
파이프라인에 빠진 안전장치" 중, 실제로 어떻게 구현해야 하는지 설명이
필요한 항목을 다룬다. **이 문서는 현재 `.github/workflows/ci.yml`이
실제로 하는 일이 아니라, 앞으로 적용을 고려할 때 알아야 할 일반
원칙과 구현 방법을 정리한 가이드다.**

다루는 항목:
1. DB 마이그레이션 롤백 시 주의점 (Expand-Contract 패턴)
2. 무중단 배포 전략 (Blue-Green / Rolling Update / Canary)
3. 헬스체크 실패 시 자동 롤백
4. 동시 배포 방지 (Concurrency Control)
5. 시크릿 관리

`cicd-pipeline-flow.md`가 나열한 나머지 항목(스테이징 사전 검증,
배포 승인 절차, 다운스트림 의존성 헬스체크, 배포 이력/감사 로그,
배포 알림, 컨테이너 리소스 제한)은 아직 이 문서에 없다 — 우선순위상
뒤로 미룬 것이며, 현재 규모(자체 Mac 러너, 단일 배포 서버)에서
투자 대비 효과가 더 큰 위 5가지를 먼저 정리했다.

---

## DB 마이그레이션 롤백 시 주의점: 스키마는 되돌리지 않는다

배포 롤백에서 가장 까다로운 지점은 "코드는 되돌릴 수 있지만, 이미
쓰여진 데이터는 되돌릴 수 없다"는 비대칭성이다. 예를 들어 신버전
배포로 컬럼이 추가되고, 잠깐의 서비스 시간 동안 그 컬럼에 실제
데이터가 쓰인 뒤 롤백이 필요해졌다고 하자. 이때 컬럼까지 같이
지우면 그 사이 쓰인 사용자 데이터를 영구히 잃는다.

**원칙**: 롤백은 애플리케이션 코드만 구버전으로 되돌리고, DB
스키마는 그대로 둔다(forward-only). 구버전 코드는 새 컬럼의 존재를
모른 채 무시하고 동작하면 된다.

이게 가능하려면 마이그레이션을 짤 때부터 "구버전 코드가 이 스키마
변경 이후에도 안전하게 동작하는가"를 전제로 설계해야 한다. 이를
**Expand-Contract 패턴**이라 부른다.

| 단계 | 내용 |
|---|---|
| Expand | 새 컬럼을 nullable(또는 기본값 지정)로 추가. 구버전 코드는 이 컬럼을 모르니 그냥 무시 |
| Migrate | 신버전 배포, 신버전 코드가 새 컬럼을 사용 |
| (롤백 지점) | 구버전으로 롤백해도 컬럼이 nullable이라 구버전의 INSERT/UPDATE가 깨지지 않음 |
| Contract | 신버전이 충분히 안정화된 뒤, 별도 배포로 `NOT NULL` 제약 추가나 구컬럼 정리 진행 |

즉 "컬럼 추가"와 "제약 조건 강화(NOT NULL, 구컬럼 삭제)"를 같은
배포에 넣지 않고 분리하는 것이 핵심이다. 이 원칙을 어기고 컬럼
추가와 동시에 `NOT NULL` 제약을 걸면, 구버전 코드가 그 컬럼을 모른
채 INSERT를 시도할 때 즉시 제약 위반 에러가 나 롤백 자체가
불가능해진다.

`prisma migrate deploy`는 기본적으로 forward-only이며 down
마이그레이션을 자동 생성하지 않는다. 따라서 이 프로젝트에
마이그레이션 단계를 `deploy` job에 도입한다면:
- 컬럼 추가 마이그레이션은 항상 nullable 또는 `@default(...)`로 작성
- `NOT NULL` 강제나 컬럼 삭제 같은 destructive 마이그레이션은 최소
  한 배포 사이클 뒤에 별도 PR로 분리
- CI에서 `prisma migrate diff`로 destructive 변경을 감지해 경고하는
  단계 추가를 고려할 것

---

## 무중단 배포 전략

### 문제의 본질

현재 `deploy` job은 `docker rm -f` 후 `docker run`을 실행한다. 이
두 명령 사이에는 3000번 포트에 아무 컨테이너도 응답하지 않는 공백이
있고, 그 순간 요청이 오면 502가 발생한다.

```
docker rm -f nest-app   ← 여기서 3000번 포트에 아무도 응답 안 함
docker run -d nest-app  ← 새 컨테이너가 뜨고 healthy 될 때까지 또 공백
```

무중단 배포 전략은 결국 "옛 컨테이너를 내리기 전에 새 컨테이너를
먼저 완전히 띄우고, 트래픽 전환은 그 사이에 한 번에 일어나게"
만드는 것이다.

### Blue-Green (포트 교체 방식)

단일 호스트 + `docker run -p 3000:3000` 구조에 가장 적합하다.

1. 기존 컨테이너(`nest-app-blue`)는 3000번 포트에서 서비스 중
2. 새 이미지로 `nest-app-green` 컨테이너를 다른 포트(예: 3001)에 기동
3. green이 헬스체크를 통과할 때까지 대기
4. 리버스 프록시(Nginx 등)가 3000 → 3001로 라우팅 전환
5. blue 컨테이너 제거

```bash
# 새 컨테이너를 임시 포트로 기동
docker run -d --name nest-app-new -p 3001:3000 ... ghcr.io/.../cicd-demo:latest

# 헬스체크 통과까지 폴링
for i in {1..10}; do
  curl -sf http://localhost:3001/ && break
  sleep 3
done

# 통과 시에만 Nginx upstream을 3001로 전환 (reload, 무중단)
sed -i 's/3000/3001/' /etc/nginx/conf.d/app.conf
nginx -s reload

# 이전 컨테이너 제거
docker rm -f nest-app-old
```

- 장점: 롤백이 즉시 가능(전환 전 실패 시 새 컨테이너만 버리면 됨), 구현이 직관적
- 단점: 리버스 프록시 도입이 선행 조건, 전환 구간 동안 리소스 2배 필요
- 현재 프로젝트에는 리버스 프록시가 없으므로 이 전략을 적용하려면 Nginx/Caddy 도입이 선행되어야 한다

### Rolling Update (오케스트레이터 필요)

여러 개의 복제본(replica) 컨테이너를 동시에 띄워두고, 한 번에
전체가 아니라 **한두 개씩 순차적으로** 새 버전으로 교체하는 방식이다.
예를 들어 복제본이 4개면 새 버전 컨테이너 1개를 띄우고 헬스체크
통과를 확인한 뒤 구버전 1개를 내리는 과정을 4번 반복한다 — 교체
도중에도 항상 최소 3개는 구버전이든 신버전이든 트래픽에 응답하고
있어 무중단이 유지된다. Blue-Green이 "전체를 한 번에 통째로
교체"한다면, Rolling Update는 "조금씩 나눠서 교체"하는 점이 다르다.

Docker Swarm이나 Kubernetes를 쓰면 `docker service update`나
Deployment의 rolling update로 플랫폼 차원에서 해결된다. 다만 현재
구조는 단일 Docker 컨테이너를 `docker run`으로 직접 실행하는
방식이라, 이 전략을 쓰려면 오케스트레이터 도입이라는 더 큰 아키텍처
변경이 선행되어야 한다. 지금 규모(자체 Mac 러너, 단일 배포 서버)에는
과도할 수 있다.

### 최소 개선: 검증 후 교체로 순서 변경 (완전한 무중단은 아님)

리버스 프록시 도입 전이라도, "지우고(rm) → 새로 만든다(run)" 순서를
"새로 만들어 검증하고(run + curl) → 통과했을 때만 지운다(rm)"로
뒤집는 것만으로 다운타임을 줄일 수 있다. "검증"과 "교체"를 분리해
최소한 불량 이미지가 배포되어 서비스가 죽는 것은 막는다.

```bash
docker pull ghcr.io/felix-y-s/cicd-demo:latest
docker run -d --name nest-app-new \
  --add-host=host.docker.internal:192.168.65.254 \
  --env-file /home/deployer/app.env \
  -p 3001:3000 \
  ghcr.io/felix-y-s/cicd-demo:latest

for i in {1..10}; do
  curl -sf http://localhost:3001/ > /dev/null && break
  [ "$i" -eq 10 ] && { echo "헬스체크 실패, 롤백"; docker rm -f nest-app-new; exit 1; }
  sleep 3
done

docker rm -f nest-app || true
docker stop nest-app-new && docker rm nest-app-new
docker run -d --name nest-app \
  --add-host=host.docker.internal:192.168.65.254 \
  --env-file /home/deployer/app.env \
  -p 3000:3000 \
  ghcr.io/felix-y-s/cicd-demo:latest
```

마지막 포트 3000 스왑 구간에는 여전히 찰나의 다운타임이 남는다.
완전한 무중단을 원하면 Blue-Green(리버스 프록시)이 필요하다.

**주의**: 위 스크립트의 `curl -sf http://localhost:3001/`은 프로세스
생존만 확인할 뿐 DB/Redis/RabbitMQ 연결 상태는 보지 못한다 — 이
한계와 개선 방법(`/health/ready` 엔드포인트)은 뒤의 "헬스체크 실패
시 자동 롤백" 섹션에서 다룬다.

### Canary 배포

전체 트래픽을 한 번에 신버전으로 넘기지 않고, 일부만 신버전으로
보내며 점진적으로 비율을 늘리는 방식.

```
1단계: 구버전 90% / 신버전 10%  ← 소수 사용자로 먼저 검증
2단계: 문제 없으면 구버전 50% / 신버전 50%
3단계: 구버전 0% / 신버전 100%  ← 완전 전환
```

각 단계 사이에 에러율, 응답 시간 같은 지표를 관찰하고, 이상이
감지되면 즉시 트래픽을 구버전으로 되돌린다.

| | Blue-Green | Rolling Update | Canary |
|---|---|---|---|
| 교체 방식 | 전체 세트를 한 번에 스왑 | 복제본을 하나씩 순차 교체 | 트래픽 비율을 단계적으로 조정 |
| 트래픽 전환 | 한 번에 100% | 교체 진행에 따라 자연히 혼재 | 의도적으로 제어 (10% → 50% → 100%) |
| 목적 | 빠르고 단순한 전환 | 복제본 여러 개를 무중단으로 순환 | 소수에게 먼저 노출해 위험 분산 |
| 문제 감지 시 영향 범위 | 전체 사용자가 이미 노출된 후 롤백 | 일부 복제본만 노출, 나머지는 구버전 | 일부 사용자만 노출, 조기 발견 가능 |
| 구현 복잡도 | 상대적으로 단순 | 오케스트레이터 필요 | 트래픽 비율 제어 + 지표 모니터링 필요 |
| 필요 인프라 | 리버스 프록시 (포트 스왑) | Docker Swarm / Kubernetes | 가중치 기반 로드밸런서 (weighted routing) |

Rolling Update와 Canary 모두 "한 번에 전체 전환"이 아니라는 점은
같지만, Rolling Update는 **인프라 교체 절차**(복제본을 순환시켜
무중단을 유지하는 방법)이고 Canary는 **트래픽 제어 전략**(위험을
줄이기 위해 노출 비율을 의도적으로 조절하는 방법)이라 목적이 다르다.
실제로 Kubernetes 같은 오케스트레이터에서는 Rolling Update 위에
Canary 트래픽 제어를 함께 쓰기도 한다.

Nginx라면 `upstream`에 가중치를 주는 방식으로 구현한다.

```nginx
upstream nest_app {
    server 127.0.0.1:3000 weight=9;  # 구버전 90%
    server 127.0.0.1:3001 weight=1;  # 신버전 10%
}
```

배포 스크립트에서 이 weight 값을 단계적으로 바꿔가며(`9:1` →
`5:5` → `0:10`) `nginx -s reload`를 반복 실행하고, 각 단계 사이에
에러율을 확인한다.

**주의**: 이 방식을 제대로 하려면 단계 사이에 사람이 지표를 보고
판단하거나, 최소한 자동 임계치 기반 롤백 로직이 있어야 실효성이
있다. 단순히 스크립트에 `sleep` + weight 변경만 넣는 건 "카나리
흉내"에 가깝고, 실제 가치(조기 이상 감지)를 얻으려면
Prometheus/Grafana 같은 모니터링 연동이나 최소한 에러 로그 집계가
필요하다. 그게 없으면 Blue-Green보다 복잡도만 늘고 얻는 게 적을 수
있다.

카나리는 보통 사용자 트래픽이 많아서 "일부만 먼저 노출"하는 것
자체가 의미 있는 규모(수천~수만 요청/분)에서 진가를 발휘한다. 현재
프로젝트 규모(자체 Mac 러너, 단일 배포 서버, 소규모 트래픽)에서는
카나리보다 Blue-Green이 투자 대비 효과가 더 좋다.

### 정리

| 전략 | 다운타임 | 구현 난이도 | 이 프로젝트 적합도 |
|---|---|---|---|
| Blue-Green + 리버스 프록시 | 사실상 0 | 중간 (Nginx 도입 필요) | 가장 현실적 |
| Rolling Update (Swarm/K8s) | 0 | 높음 (오케스트레이터 도입) | 현재 규모엔 과함 |
| Canary (weighted routing) | 사실상 0, 단계적 검증 가능 | 높음 (모니터링 연동 필요) | 트래픽 규모가 커지면 고려 |
| 스왑 순서 개선만 (프록시 없이) | 수백ms~1초 | 낮음 | 임시 개선책 |

---

## 헬스체크 실패 시 자동 롤백

### 선행 문제: 지금 헬스체크는 무엇을 확인하고, 무엇을 확인하지 못하는가

지금 이 프로젝트의 헬스체크(`curl -sf http://localhost:3000/`)에는
두 가지 한계가 있다.

1. **확인 대상이 "프로세스 생존"뿐이다.** 루트 엔드포인트는 고정
   문자열만 반환할 뿐 PostgreSQL(Prisma)·MongoDB·Redis·RabbitMQ
   연결은 확인하지 않는다.
2. **`curl -sf`는 HTTP 상태 코드만 본다.** 엔드포인트가 에러를
   삼키고 200으로 응답하면 `-f` 옵션은 이를 성공으로 판정한다.

### 개선 방향: liveness와 readiness를 분리한다

"그럼 헬스체크에서 DB/Redis/RabbitMQ를 전부 확인하면 되지 않나"라고
생각하면, 이번엔 반대 문제가 생긴다 — 그 무거운 체크를 매 요청마다
돌리면(로드밸런서나 모니터링이 주기적으로 호출하는 경우) 정작
DB 커넥션 풀에 불필요한 부하를 준다. 그래서 실무에서는 목적이 다른
엔드포인트 두 개로 분리하는 게 표준이다.

| 엔드포인트 | 확인 대상 | 무거움 | 언제 쓰는가 |
|---|---|---|---|
| `/health/live` (liveness) | 프로세스가 요청에 응답 가능한가 | 가벼움 | Kubernetes 등 오케스트레이터가 있으면 kubelet이 주기 호출 후 연속 실패 시 컨테이너를 자동 재시작하는 데 씀 — **지금 이 프로젝트는 단일 `docker run` 구조라 이 판단을 대신 내려줄 주체가 없다. 지금은 도입해도 실제로 호출하는 쪽이 없는 예비 엔드포인트다** |
| `/health/ready` (readiness) | DB·Redis·RabbitMQ 등 의존 인프라 연결까지 정상인가 | 상대적으로 무거움 | **배포 파이프라인**이 "트래픽을 받을 준비가 됐나" 판단 — 지금 당장 실질적으로 쓰이는 쪽은 이것뿐이다 |

배포 스크립트의 헬스체크는 매 초 반복 호출되는 게 아니라 **배포
시점에 몇 번만** 호출되므로, `readiness`처럼 무거운 체크를 써도
문제가 없다 — 오히려 이 시점에는 얕은 체크로는 못 잡는 "거짓
성공"을 반드시 걸러야 한다.

NestJS라면 [`@nestjs/terminus`](https://docs.nestjs.com/recipes/terminus)로
이런 엔드포인트를 구성하는 것이 표준적인 방법이다. **현재
`package.json`에는 설치되어 있지 않으므로 선행 설치가 필요하다.**

```bash
pnpm add @nestjs/terminus
```

`@nestjs/terminus`는 TypeORM/Mongoose 등 일부 공식 Indicator를
제공하지만, 이 프로젝트가 쓰는 **Prisma와 ioredis 기반 Redis에는
공식 Indicator가 없다** — 아래처럼 `HealthIndicatorService`를 받아
직접 확인 로직을 작성해야 한다.

```typescript
// health.controller.ts (개념 예시 — 실제 도입 시 별도 모듈로 분리)
@Controller('health')
export class HealthController {
  constructor(
    private health: HealthCheckService,
    private indicators: HealthIndicatorService,
    private prisma: PrismaService,
    private redis: RedisService,
    // MongoDB, RabbitMQ도 각자의 연결 상태를 같은 패턴으로 추가
  ) {}

  @Public()
  @Get('live')
  live() {
    return { status: 'ok' }; // 프로세스 생존만 확인, 의존성 체크 없음
  }

  @Public()
  @Get('ready')
  @HealthCheck()
  ready() {
    return this.health.check([
      // Prisma: 공식 Indicator가 없으므로 SELECT 1로 직접 연결 확인
      async () => {
        const indicator = this.indicators.check('prisma');
        try {
          await this.prisma.$queryRaw`SELECT 1`;
          return indicator.up();
        } catch (e) {
          return indicator.down({ message: (e as Error).message });
        }
      },
      // Redis: 공식 Indicator가 없으므로 ping으로 직접 연결 확인
      async () => {
        const indicator = this.indicators.check('redis');
        try {
          await this.redis.ping();
          return indicator.up();
        } catch (e) {
          return indicator.down({ message: (e as Error).message });
        }
      },
    ]);
    // 하나라도 down이면 terminus가 자동으로 HTTP 503을 반환한다
  }
}
```

`@HealthCheck()`가 적용된 엔드포인트는 내부 체크 중 하나라도
`down`이면 **자동으로 HTTP 503**을 반환하도록 terminus가 처리해준다
— 즉 "본문에는 에러가 담겨 있는데 상태 코드는 200"이라는, 위에서
지적한 `curl -sf`의 허점이 여기서는 구조적으로 발생하지 않는다.

배포 스크립트에서는 `/`가 아니라 이 `/health/ready`를 검증 대상으로
바꾸기만 하면 된다.

```bash
curl -sf http://localhost:3001/health/ready > /dev/null
```

### 롤백 로직 자체의 문제

헬스체크 대상을 `/health/ready`로 고쳤다고 해도, 그 결과를 어떻게
처리하는지가 또 다른 문제다. 현재 `deploy` job은 다음 순서로
동작한다.

```
docker rm -f nest-app        ← 이전 컨테이너 즉시 삭제
docker run -d nest-app       ← 새 이미지로 기동
curl http://localhost:3000/  ← 헬스체크는 그 다음에야 실행
```

헬스체크가 여기서 실패해도 **이미 이전 컨테이너는 삭제된 뒤**라 되돌릴
대상이 없다. 즉 "헬스체크"라는 이름의 단계는 있지만, 실패했을 때
아무 조치도 취하지 않고 그대로 워크플로만 빨간 줄이 되어 끝난다 —
서비스는 불량 컨테이너 상태로 계속 방치된다.

### 원칙: 실패 가능성이 있는 작업은 되돌릴 대상을 지운 다음이 아니라
지우기 전에 검증한다

"최소 개선: 검증 후 교체로 순서 변경" 섹션에서 다룬 임시 포트(3001) 기동
방식이 이미 이 원칙을 따르고 있다. 이를 "헬스체크 실패 시 이전
컨테이너를 그대로 유지한 채 새 컨테이너만 버리고 배포를 실패
처리"하는 롤백 로직으로 명시적으로 확장하면 된다.

```bash
set -e

# 1. 새 컨테이너를 임시 포트로 기동 (기존 nest-app은 그대로 서비스 중)
docker pull ghcr.io/felix-y-s/cicd-demo:latest
docker rm -f nest-app-new 2>/dev/null || true
docker run -d --name nest-app-new \
  --add-host=host.docker.internal:192.168.65.254 \
  --env-file /home/deployer/app.env \
  -p 3001:3000 \
  ghcr.io/felix-y-s/cicd-demo:latest

# 2. 새 컨테이너만 헬스체크(readiness). 실패 시 새 컨테이너만 정리하고 배포 중단
healthy=false
for i in {1..10}; do
  if curl -sf http://localhost:3001/health/ready > /dev/null; then
    healthy=true
    break
  fi
  sleep 3
done

if [ "$healthy" != "true" ]; then
  echo "헬스체크 실패 — 기존 nest-app은 영향 없이 계속 서비스 중" >&2
  docker logs --tail 50 nest-app-new >&2 || true
  docker rm -f nest-app-new
  exit 1   # 워크플로를 실패 처리해 알림(추가 시)이 발생하도록 함
fi

# 3. 헬스체크 통과했을 때만 실제 교체 수행 (3001 → 3000 포트 스왑)
docker rm -f nest-app || true
docker stop nest-app-new && docker rm nest-app-new
docker run -d --name nest-app \
  --add-host=host.docker.internal:192.168.65.254 \
  --env-file /home/deployer/app.env \
  -p 3000:3000 \
  ghcr.io/felix-y-s/cicd-demo:latest
```

이 방식의 핵심은 "교체"와 "검증"의 순서를 바꾸는 것만으로 별도
인프라(리버스 프록시, 모니터링) 없이도 최소한 **"배포 실패가 곧
서비스 다운"** 이라는 최악의 시나리오는 막을 수 있다는 점이다.
Blue-Green이 "무중단"을 목표로 한다면, 이 패턴은 "배포 실패해도
최소한 기존 서비스는 지킨다"는 더 낮은 목표를 훨씬 적은 비용으로
달성한다.

**주의**: 3단계에서 3001번 컨테이너를 내리고 3000번으로 다시
기동하는 구간에는 여전히 찰나의 다운타임이 남는다(포트는 컨테이너
재생성 없이 바꿀 수 없어 `docker rename`만으로는 해결되지 않는다).
이 구간까지 완전히 없애려면 리버스 프록시를 도입해(Blue-Green)
포트 스왑 자체를 `nginx -s reload`로 대체해야 한다.

---

## 동시 배포 방지 (Concurrency Control)

### 문제의 본질

현재 워크플로에는 `concurrency` 키가 없다. 짧은 시간에 커밋을 연속으로
`main`에 push하면(또는 PR을 연달아 머지하면) 여러 `deploy` job이
동시에 같은 self-hosted 러너에서 실행될 수 있다. `deploy` job은
`nest-app`이라는 고정된 컨테이너 이름을 다루기 때문에, 두 워크플로가
동시에 `docker rm -f nest-app` / `docker run --name nest-app`을
실행하면 "이름 충돌로 인한 컨테이너 생성 실패"나 "늦게 pull한
워크플로가 먼저 끝난 워크플로의 새 이미지를 다시 구버전으로 덮어쓰는"
레이스 컨디션이 발생할 수 있다.

### 원칙: 같은 배포 대상에 대한 배포는 한 번에 하나만 실행되어야 한다

GitHub Actions는 워크플로 레벨에 `concurrency` 키를 선언하는 것만으로
이를 해결한다. 같은 `group` 값을 가진 실행이 이미 진행 중일 때 새
실행을 어떻게 처리할지는 `cancel-in-progress` 값으로 정한다 —
`false`면 새 실행이 큐에서 대기하고, `true`면 진행 중이던 이전
실행을 취소하고 새 실행을 바로 시작한다. 

```yaml
# ci.yml 최상단 (on: 블록 근처)에 추가
concurrency:
  group: deploy-production
  cancel-in-progress: false
```

- `cancel-in-progress: false`를 선택하는 이유: 배포 중간에 취소하면
  컨테이너가 절반만 교체된 상태로 멈출 수 있다. 진행 중인 배포는
  끝까지 마치게 하고, 다음 배포는 큐에서 대기시키는 편이 안전하다.
- `test`/`build-and-push` job까지 큐잉하고 싶지 않다면(PR 검증은
  병렬로 여러 개 돌아도 무방하므로), `concurrency`를 워크플로 전체가
  아니라 `deploy` job에만 선언할 수도 있다:

```yaml
jobs:
  deploy:
    concurrency:
      group: deploy-production
      cancel-in-progress: false
    runs-on: self-hosted
    needs: push-ghcr
    ...
```

이 프로젝트처럼 배포 대상이 단일 환경(서버 1대)일 때는 job 레벨
선언이 더 적합하다 — 테스트/빌드는 여러 PR에서 병렬로 계속 돌되,
실제 프로덕션 컨테이너를 건드리는 `deploy` job만 직렬화된다.

---

## 시크릿 관리

### 문제의 본질

배포 서버의 `/home/deployer/app.env`에는 `DATABASE_URL`,
`JWT_SECRET`, `JWT_REFRESH_SECRET` 등 민감 정보가 **평문 파일**로
저장되어 있다. `docker run --env-file`이 이 파일을 그대로 읽어
컨테이너 환경변수로 주입하는 구조라, 다음 두 가지 위험이 있다.

- 배포 서버(또는 배포 서버가 떠 있는 Docker-in-Docker 컨테이너)가
  침해되면 시크릿이 그대로 노출된다.
- 파일이 언제 마지막으로 수정됐는지, 누가 값을 바꿨는지 추적할 방법이
  없다 — SSH로 직접 서버에 들어가 파일을 고치는 방식이기 때문이다.

### 원칙: 시크릿의 단일 진실 공급원(source of truth)을 두고, 배포
시점에만 서버로 전달한다

현재 규모(자체 배포 서버 1대, GitHub Secrets 이미 SSH 개인키 관리에
사용 중)에서 가장 비용이 적은 개선 순서는 다음과 같다.

1. **최소 조치: 파일 권한 강화** — `chmod 600 app.env`로 `deployer`
   유저 본인만 읽을 수 있게 제한한다(현재 권한을 확인하지 않았다면
   가장 먼저 점검할 항목). 별도 인프라 없이 즉시 적용 가능하다.
2. **중간 단계: GitHub Secrets에서 배포 시점에 생성** — `app.env`
   파일을 서버에 고정해두지 않고, `deploy` job이 `secrets.*`를 읽어
   SSH로 서버에 전달한 뒤 그 자리에서 파일을 쓰는 방식으로 바꾼다.
   이러면 시크릿의 단일 진실 공급원이 "서버 위 파일"에서 "GitHub
   Secrets"로 옮겨져, 값 변경/감사가 GitHub 쪽에서 이루어진다.

   ```yaml
   - name: app.env 생성 및 서버 전달
     run: |
       cat <<EOF > /tmp/app.env
       DATABASE_URL=${{ secrets.PROD_DATABASE_URL }}
       JWT_SECRET=${{ secrets.PROD_JWT_SECRET }}
       JWT_REFRESH_SECRET=${{ secrets.PROD_JWT_REFRESH_SECRET }}
       EOF
       scp -i ~/.ssh/deploy_key -P 2222 \
         -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null \
         /tmp/app.env deployer@localhost:/home/deployer/app.env
       rm -f /tmp/app.env
   ```

   GitHub Actions는 워크플로 로그에서 `secrets.*` 값을 자동으로
   마스킹하지만, 러너 로컬 파일(`/tmp/app.env`)은 마스킹 대상이
   아니므로 사용 후 즉시 삭제해야 한다는 점에 주의.
3. **장기 과제: 전용 시크릿 관리 도구 도입** — Vault, AWS Secrets
   Manager, Doppler 같은 도구로 옮기면 회전(rotation)과 접근 감사
   로그까지 얻을 수 있지만, 현재 규모(자체 Mac 러너, 단일 배포
   서버)에서는 운영 부담 대비 효과가 낮다. 트래픽/팀 규모가 커질 때
   고려 대상.

이 프로젝트에는 2번(배포 시점 전달)이 투자 대비 효과가 가장 크다 —
이미 SSH 키를 GitHub Secrets로 관리하는 패턴이 있으므로 동일한
방식을 시크릿에도 확장하기만 하면 된다.
