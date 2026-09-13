# 배포 자동화 대안: 터널(ngrok/cloudflared) 방식

5단계에서 선택한 방식은 **self-hosted runner**(GitHub Actions 러너를
직접 Mac에 설치)였다. 이 문서는 그 대안인 **터널 방식**을 정리한다.
실제로 이 프로젝트에 적용하지는 않았고, 개념과 트레이드오프 비교가
목적이다.

---

## 두 방식이 푸는 문제는 같다

GitHub Actions의 기본(클라우드) 러너는 인터넷에 있고, 로컬 배포
서버(Mac 위 Docker 컨테이너)는 사설 네트워크에 있다. **클라우드 러너가
사설 IP로 직접 SSH 접속할 방법이 없다**는 게 공통된 출발점이다.

이 문제를 푸는 방향은 정반대인 두 가지가 있다:

| | self-hosted runner | 터널 (ngrok/cloudflared) |
|---|---|---|
| 발상 | "GitHub이 못 들어오니, 내가 GitHub 쪽으로 나간다" | "내가 못 나가니, 배포 서버를 GitHub이 들어올 수 있게 연다" |
| 실행 주체가 바뀌는 것 | 워크플로의 job 자체가 이 Mac에서 실행됨 | 워크플로는 그대로 클라우드에서 실행되고, SSH 접속 대상만 외부에 노출됨 |
| 네트워크 방향 | Mac → GitHub (아웃바운드만, 항상 열려 있음) | GitHub → 터널 서버 → 내 Mac (인바운드 경로가 임시로 생김) |

---

## 터널 방식의 동작 원리

### 1) 터널이 하는 일
`ngrok`이나 `cloudflared` 같은 도구를 배포 서버(또는 배포 서버가 있는
Mac)에서 실행하면, 이 도구가 **아웃바운드 연결**로 ngrok/Cloudflare의
서버에 접속한 뒤, 그 서버에 "누가 나한테 오면 이 로컬 포트로 연결해줘"라고
등록한다. 그러면 외부에서 `<임의의-주소>.ngrok.io:12345` 같은 공개
주소로 접속하면, 그 트래픽이 터널을 타고 내 로컬 포트(예: 2222, SSH)까지
전달된다.

```
GitHub Actions (클라우드 러너)
   │  ssh -p 12345 deployer@xxxx.ngrok.io
   ▼
ngrok 클라우드 서버 (공개 인터넷)
   │  (터널로 전달)
   ▼
내 Mac에서 실행 중인 ngrok 클라이언트
   │  (localhost:2222로 전달)
   ▼
배포 서버 컨테이너의 SSH(22번, 호스트 2222에 매핑)
```

핵심은 "포트가 뚫린 것"이 아니라 **"내 쪽에서 먼저 터널 서버로 나가는
연결을 만들어 두고, 그 연결을 거꾸로 타고 들어오게 하는 것"**이라는
점이다. 그래서 라우터에서 포트포워딩을 직접 설정하거나 공인 IP가
없어도 동작한다 (self-hosted runner도 아웃바운드만 쓴다는 점은
동일하지만, 터널은 "SSH 접속 경로 자체"를 외부에 여는 것이고
self-hosted runner는 "워크플로 실행 위치"를 바꾸는 것이라는 차이가 있다).

### 2) ngrok 예시 (개념 코드, 실제 적용 안 함)
```bash
# 배포 서버가 있는 Mac에서 실행
ngrok tcp 2222
# 실행하면 아래와 비슷한 출력이 나옴:
# Forwarding  tcp://0.tcp.ngrok.io:14589 -> localhost:2222
```
이 `0.tcp.ngrok.io:14589`라는 주소가 임시로 발급되는데, 무료 플랜은
**재시작할 때마다 주소가 바뀐다**(고정 도메인은 유료). 그래서 워크플로에서
이 주소를 매번 동적으로 알아내는 절차가 추가로 필요하다.

### 3) cloudflared 예시 (개념 코드, 실제 적용 안 함)
```bash
# Cloudflare 계정에 도메인이 있다면 고정 주소로 터널을 만들 수 있다
cloudflared tunnel create deploy-server-tunnel
cloudflared tunnel route dns deploy-server-tunnel ssh.mydomain.com
cloudflared tunnel run --url ssh://localhost:2222 deploy-server-tunnel
```
Cloudflare Tunnel은 (도메인이 있다는 전제하에) **고정 주소**를 무료로
쓸 수 있어서 ngrok 무료 플랜보다 실전에 가깝다. GitHub Actions 워크플로
쪽에서는 SSH ProxyCommand로 `cloudflared access ssh` 클라이언트를 거쳐
접속하는 방식을 쓴다.

---

## self-hosted runner를 선택한 이유 (이 프로젝트 기준)

1. **추가 계정/도메인 불필요**: ngrok은 무료 플랜의 주소가 매번 바뀌어
   워크플로가 그 주소를 다시 알아내는 절차가 필요하고, cloudflared로
   고정 주소를 쓰려면 Cloudflare에 도메인을 등록해야 한다. self-hosted
   runner는 GitHub 계정만으로 등록 가능해서 학습 목적에 더 단순했다.
2. **이미 SSH 키 기반 인증을 4단계에서 구성해 둔 상태**: 터널을 추가하면
   "SSH 인증"과 "터널 인증(ngrok/Cloudflare 계정)"이라는 별개의 보안
   계층이 하나 더 생긴다. self-hosted runner는 기존 SSH 흐름을 그대로
   재사용할 수 있었다.
3. **워크플로가 실행되는 위치를 바꾸는 것이 개념적으로 더 명확**: "이
   job은 클라우드가 아니라 내 컴퓨터에서 돈다"는 게 self-hosted runner
   레이블(`runs-on: self-hosted`)로 명시적으로 드러나서, 나중에 이
   워크플로를 다시 볼 때 무슨 일이 일어나는지 이해하기 쉬웠다.

## 터널 방식이 더 나은 상황 (참고)

- **여러 사람이 팀으로 작업**해서, 개인 Mac이 아니라 별도의 상시
  가동되는 배포 서버가 있는 경우 — self-hosted runner를 그 서버에 두면
  되지만, 그 서버가 방화벽 뒤에 있고 자체 runner 설치가 어려운 정책상
  제약이 있다면 터널이 대안이 된다.
- **GitHub Actions 러너 자체를 유지보수하고 싶지 않은 경우** — 클라우드
  러너를 그대로 쓰고, "배포 대상 서버 쪽 접근 경로"만 열어주는 것이
  개념적으로 더 단순할 수 있다 (러너 등록/업데이트/보안 패치를 신경 쓸
  필요가 없음).
- **배포 서버가 이미 상시 켜져 있는 실제 운영 서버**인 경우 — 노트북을
  self-hosted runner로 켜둘 필요 없이, 터널만 상시 실행해두면 된다.

## 공통으로 남는 근본적 트레이드오프

두 방식 모두 "GitHub Actions가 내 개인/사설 인프라에 접근할 수 있는
경로를 만든다"는 점에서 보안 책임이 늘어난다. self-hosted runner는
"내 컴퓨터가 GitHub이 보낸 임의 코드를 실행할 수 있다"는 리스크를,
터널은 "SSH 포트가 (터널 서비스를 경유해) 인터넷에 사실상 노출된다"는
리스크를 각각 진다. 개인 학습/실습 환경에서는 둘 다 감수 가능한
수준이지만, 실무에서는 이런 리스크를 이유로 온프레미스 배포에
self-hosted runner를 쓸 때 방화벽 화이트리스트, 러너 격리(컨테이너
안에서만 실행) 등 추가 조치를 함께 고려한다.
