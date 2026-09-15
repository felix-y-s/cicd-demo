# 배포 안전장치 구현 가이드

[cicd-pipeline-flow.md](./cicd-pipeline-flow.md)에서 정리한 "지금
파이프라인에 빠진 안전장치" 중, 실제로 어떻게 구현해야 하는지 설명이
필요한 항목을 다룬다. **이 문서는 현재 `.github/workflows/ci.yml`이
실제로 하는 일이 아니라, 앞으로 적용을 고려할 때 알아야 할 일반
원칙과 구현 방법을 정리한 가이드다.**

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

Docker Swarm이나 Kubernetes를 쓰면 `docker service update`나
Deployment의 rolling update로 플랫폼 차원에서 해결된다. 다만 현재
구조는 단일 Docker 컨테이너를 `docker run`으로 직접 실행하는
방식이라, 이 전략을 쓰려면 오케스트레이터 도입이라는 더 큰 아키텍처
변경이 선행되어야 한다. 지금 규모(자체 Mac 러너, 단일 배포 서버)에는
과도할 수 있다.

### 최소 개선: 스왑 순서 변경 (완전한 무중단은 아님)

리버스 프록시 도입 전이라도, 스크립트 순서만 바꿔 다운타임을 줄일
수 있다. "검증"과 "교체"를 분리해 최소한 불량 이미지가 배포되어
서비스가 죽는 것은 막는다.

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

| | Blue-Green | Canary |
|---|---|---|
| 트래픽 전환 | 한 번에 100% | 점진적 (10% → 50% → 100%) |
| 문제 감지 시 영향 범위 | 전체 사용자가 이미 노출된 후 롤백 | 일부 사용자만 노출, 조기 발견 가능 |
| 구현 복잡도 | 상대적으로 단순 | 트래픽 비율 제어 + 지표 모니터링 필요 |
| 필요 인프라 | 리버스 프록시 (포트 스왑) | 가중치 기반 로드밸런서 (weighted routing) |

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
