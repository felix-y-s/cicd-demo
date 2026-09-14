# GitHub Actions 워크플로 문법 정리

`.github/workflows/ci.yml`에서 실제로 사용한 문법 요소를 정리한다.
"이 프로젝트에서 왜 이 문법을 썼는지"를 기준으로 설명하고, 파일 안의
실제 코드를 예시로 인용한다. GitHub Actions 문법 전체가 아니라, 이
워크플로에 등장한 것만 다룬다.

---
**Docker에서 이미지를 가리키는 방법**
```
ghcr.io/felix-y-s/cicd-demo                              # 이름만 (태그 없음, 암묵적으로 :latest)
ghcr.io/felix-y-s/cicd-demo:latest                        # 태그 형태
ghcr.io/felix-y-s/cicd-demo@sha256:3a4f1c...               # 다이제스트 형태
ghcr.io/felix-y-s/cicd-demo:latest@sha256:3a4f1c...        # 태그 + 다이제스트 (정규화된 형태)
```
---

## 1. 워크플로 최상위 구조

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  test: ...
  build-and-push: ...
  push-ghcr: ...
  deploy: ...
```

- `name`: Actions 탭에 표시되는 워크플로 이름.
- `on`: 이 워크플로를 실행시키는 이벤트(트리거). 아래 두 이벤트를 등록:
  - `push.branches: [main]` — `main`에 커밋이 push될 때.
  - `pull_request.branches: [main]` — `main`을 대상(base)으로 하는 PR이
    열리거나 갱신될 때.
  - 이렇게 두 이벤트를 등록하면, 같은 커밋이라도 "PR로 올라왔을 때"와
    "main에 merge되어 push됐을 때" 각각 워크플로가 실행된다. 이 프로젝트는
    이 차이를 `if:` 조건(§4)으로 활용해 "PR에서는 빌드 검증까지만, main
    push에서만 실제 배포"를 구현했다.
- `jobs`: 워크플로를 구성하는 job들. 각 job은 기본적으로 **서로 독립된
  가상머신(또는 등록된 러너)**에서 실행되며, 명시적으로 `needs`로 묶지
  않으면 병렬로 동시에 시작된다.

---

## 2. `runs-on` — 이 job이 어디서 실행되는가

```yaml
runs-on: ubuntu-latest
```
```yaml
runs-on: ${{ matrix.runner }}
```
```yaml
runs-on: self-hosted
```

- 문자열 하나만 쓰면 GitHub가 제공하는 표준(호스티드) 러너를 그대로 지정.
  `ubuntu-latest`가 가장 흔히 쓰는 리눅스 러너.
- `${{ matrix.runner }}`처럼 표현식을 넣으면, `strategy.matrix`(§7)에서
  정의한 값이 조합마다 다르게 대입된다. 이 워크플로에서는 amd64는
  `ubuntu-latest`, arm64는 `ubuntu-24.04-arm`으로 각각 다른 러너를 쓰게
  했다 (QEMU 에뮬레이션 대신 네이티브 아키텍처 러너를 쓰기 위함).
- `self-hosted`는 GitHub 클라우드가 아니라, **사용자가 직접 등록한
  컴퓨터**에서 job을 실행하라는 뜻. `deploy` job에 이걸 쓴 이유는,
  GitHub 클라우드 러너가 사설 네트워크에 있는 로컬 배포 서버에 SSH로
  접속할 방법이 없어서, 배포 서버와 같은 네트워크에 있는 컴퓨터(Mac)를
  러너로 등록해 그 job만 거기서 돌게 하기 위해서다.

---

## 3. `jobs.<id>.needs` — job 사이의 실행 순서 강제

```yaml
build-and-push:
  needs: test

push-ghcr:
  needs: build-and-push

deploy:
  needs: push-ghcr
```

- 기본적으로 병렬 실행되는 job들 사이에 **순서와 의존 관계**를 명시한다.
- `needs: test`는 "test job이 끝나야(그리고 기본적으로 *성공*해야) 이
  job을 시작한다"는 뜻. `test`가 실패하면 그 뒤에 `needs`로 연결된 job은
  전부 자동으로 건너뛴다(스킵) — 별도 조건문 없이도 "테스트 통과한
  코드만 배포"가 강제된다.
- `needs: build-and-push`처럼 배열이 아니라 단일 값을 써도 되고, 여러
  job에 의존한다면 `needs: [a, b]`처럼 배열로 쓴다 (이 파일에는 단일
  의존만 있어 배열 형태는 등장하지 않음).

---

## 4. `if` — 조건부 실행

```yaml
build-and-push:
  if: github.event_name == 'push' && github.ref == 'refs/heads/main'
```
```yaml
- name: SSH 개인키 정리
  if: always()
  run: rm -f ~/.ssh/deploy_key
```

- job 레벨의 `if`: 조건이 거짓이면 그 job 전체가 "skipped" 상태로 표시되고
  실행되지 않는다. `github.event_name`(이 실행을 일으킨 이벤트 종류)과
  `github.ref`(어떤 브랜치/태그인지)를 조합해 "main으로의 push일 때만"을
  표현했다. 같은 워크플로가 PR에서도 실행되지만, 이 조건 덕분에
  `build-and-push`/`push-ghcr`/`deploy`는 PR에서는 그냥 스킵된다.
- 스텝(step) 레벨의 `if: always()`: 기본적으로 어떤 스텝이 실패하면
  그 이후 스텝은 전부 건너뛰지만, `always()`를 쓴 스텝은 **앞 스텝의
  성공/실패와 무관하게 항상 실행**된다. SSH 개인키를 담은 임시 파일을
  "배포가 실패하든 성공하든 반드시 정리"하기 위해 정리 스텝에만 붙였다.

---

## 5. `${{ }}` — 표현식 문법

GitHub Actions에서 정적 텍스트가 아니라 **동적으로 계산된 값**을 쓰고
싶을 때는 항상 `${{ ... }}`로 감싼다. 이 워크플로에 등장한 것들:

| 표현식 | 의미 | 예시 값 |
|---|---|---|
| `${{ matrix.runner }}` | 현재 matrix 조합의 `runner` 값 | `ubuntu-24.04-arm` |
| `${{ matrix.platform }}` | 현재 matrix 조합의 `platform` 값 | `linux/arm64` |
| `${{ matrix.suffix }}` | 현재 matrix 조합의 `suffix` 값 | `arm64` |
| `${{ github.actor }}` | 이 워크플로를 트리거한 사용자(계정명) | `felix-y-s` |
| `${{ github.repository }}` | `owner/repo` 형태의 저장소 전체 이름 | `felix-y-s/cicd-demo` |
| `${{ secrets.GITHUB_TOKEN }}` | 매 실행마다 자동 발급되는 임시 토큰 | `ghs_xxxxxxxxxxxxxxxxxxxx` |
| `${{ secrets.DEPLOY_SSH_PRIVATE_KEY }}` | 직접 등록한 저장소 Secret | `-----BEGIN OPENSSH PRIVATE KEY-----...` |
| `${{ steps.build.outputs.digest }}` | 이전 스텝(`id: build`)이 출력한 값 | `sha256:3a4f1c...` |
| `${{ steps.meta.outputs.tags }}` | 이전 스텝(`id: meta`)이 출력한 값 | `ghcr.io/felix-y-s/cicd-demo:latest`<br>`ghcr.io/felix-y-s/cicd-demo:sha-1a2b3c4` |

`steps.<id>.outputs.<name>` 형태는, 어떤 스텝이 `id:`를 갖고 있고 그
액션(또는 스크립트)이 표준 출력 메커니즘으로 값을 내보낼 때 뒤따르는
스텝에서 그 값을 참조하는 방법이다. 예:
```yaml
- name: 아키텍처별 이미지 빌드 및 push (다이제스트만 우선 생성)
  id: build
  uses: docker/build-push-action@v7
  ...
- name: 다이제스트 아티팩트 저장
  run: |
    digest="${{ steps.build.outputs.digest }}"
```
`docker/build-push-action`은 빌드한 이미지의 다이제스트를 `digest`라는
output으로 내보내도록 미리 구현돼 있고, 그걸 `id: build`로 이름 붙여
바로 다음 스텝에서 꺼내 쓴 것이다.

---

## 6. `jobs.<id>.services` — job 실행 중 임시로 띄우는 컨테이너

```yaml
services:
  postgres:
    image: postgres:16-alpine
    env:
      POSTGRES_USER: nest
      POSTGRES_PASSWORD: nest
      POSTGRES_DB: nest_template
    ports:
      - 5432:5432
    options: >-
      --health-cmd "pg_isready -U nest"
      --health-interval 5s
      --health-timeout 5s
      --health-retries 10
```

- `services`는 그 job이 실행되는 동안만 존재하는 **사이드카 컨테이너**를
  정의한다. job이 끝나면 자동으로 정리된다.
- 각 서비스 키(`postgres`, `mongodb`, `redis`, `rabbitmq`)는 임의로
  붙이는 이름이고, `image`가 실제로 띄울 Docker 이미지.
- `env`는 그 컨테이너에 주입할 환경변수 — `docker run -e`와 동일한 역할.
- `ports: - 5432:5432`는 `호스트포트:컨테이너포트` 매핑. `services`로
  뜬 컨테이너는 같은 러너 안에서 `localhost:<호스트포트>`로 접근 가능해,
  이 job의 다른 스텝(`pnpm test` 등)이 실제 DB처럼 사용할 수 있다.
- `options`는 `docker create`에 그대로 전달되는 추가 옵션 문자열.
  `--health-cmd`로 시작하는 옵션들은 **헬스체크**를 구성해서, 컨테이너가
  뜨긴 했지만 아직 요청을 받을 준비가 안 된 상태(DB 초기화 중 등)에서
  다음 스텝이 곧바로 연결을 시도해 실패하는 것을 막는다. GitHub Actions는
  헬스체크가 통과할 때까지 기다렸다가 이후 스텝을 진행한다.
- **주의(이 프로젝트에서 실제로 겪은 제약)**: `options`는 어디까지나
  "컨테이너를 만들 때 줄 수 있는 옵션"만 받을 뿐, **컨테이너 실행
  커맨드(entrypoint 뒤에 오는 인자) 자체를 바꿀 수는 없다.** 그래서
  `redis` 서비스에 `docker-compose.yml`처럼 `--requirepass`로 비밀번호를
  거는 것이 불가능해, CI에서는 인증 없는 기본 Redis로 대체했다.

---

## 7. `strategy.matrix` — 같은 job을 여러 조합으로 반복 실행

```yaml
strategy:
  matrix:
    include:
      - platform: linux/amd64
        runner: ubuntu-latest
        suffix: amd64
      - platform: linux/arm64
        runner: ubuntu-24.04-arm
        suffix: arm64

runs-on: ${{ matrix.runner }}
```

- `matrix`는 하나의 job 정의를 **여러 값 조합으로 병렬 실행**하게
  해주는 기능. `include` 아래 나열한 각 항목이 독립된 job 인스턴스가
  된다 — 위 예시는 실제로 job이 2개(amd64용 하나, arm64용 하나) 생겨
  동시에 실행된다.
- 각 조합 안의 키(`platform`, `runner`, `suffix`)는 임의로 정한 이름이고,
  스텝 안에서 `${{ matrix.<키> }}`로 그 값을 꺼내 쓴다.
- 이 프로젝트에서 matrix를 쓴 이유: 처음엔 `platforms:
  linux/amd64,linux/arm64`를 한 job 안에서 QEMU로 에뮬레이션해 동시에
  빌드했는데, arm64 크로스 빌드에서 Prisma 네이티브 엔진이 크래시하는
  문제가 생겼다. matrix로 두 아키텍처를 **각각 다른 진짜 하드웨어
  러너**에서 독립적으로 빌드하게 바꿔 에뮬레이션 자체를 없앴다.

---

## 8. `docker/build-push-action`의 `outputs`/`cache-*` — 다이제스트만 push하고 캐시를 분리하기

```yaml
- name: 아키텍처별 이미지 빌드 및 push (다이제스트만 우선 생성)
  id: build
  uses: docker/build-push-action@v7
  with:
    context: .
    platforms: ${{ matrix.platform }}
    push: true
    # 태그 없이 다이제스트로만 push한다. 최종 latest/sha 태그는
    # push-ghcr job에서 두 다이제스트를 합쳐 붙인다.
    outputs: type=image,name=ghcr.io/${{ github.repository }},push-by-digest=true,name-canonical=true,push=true
    cache-from: type=gha,scope=${{ matrix.suffix }}
    cache-to: type=gha,mode=max,scope=${{ matrix.suffix }}
```

이 스텝은 §7의 matrix로 나뉜 job(`build-and-push`)이 각 아키텍처를 빌드할
때 쓰인다. 한 아키텍처만 빌드하는 job이 GHCR에 곧바로 `latest` 태그를
붙여버리면, 다른 아키텍처 빌드가 아직 안 끝났는데 절반짜리(단일
아키텍처) 이미지가 그 태그로 노출되는 순간이 생긴다. 그래서 이 단계는
**태그를 붙이지 않고 다이제스트로만** 이미지를 올려 두고, 최종 태그
부여는 두 빌드가 모두 끝난 뒤 `push-ghcr` job(§9에서 다이제스트를
전달받아 §13의 `docker buildx imagetools create`로 매니페스트를
합치는 job)에서 한 번에 한다.

- `platforms: ${{ matrix.platform }}`: matrix 조합 하나당 **단일**
  아키텍처만 빌드한다 (§7과 달리 여기는 콤마로 여러 개를 나열하지 않음
  — 이미 job 자체가 아키텍처별로 나뉘어 있으므로).

- `outputs`: 이 액션이 결과물을 어떻게 내보낼지 세부 지정하는 옵션.
  쉼표로 구분된 키=값 목록:
  - `type=image`: 이미지 형태로 내보낸다.
  - `name=ghcr.io/${{ github.repository }}`: 어느 저장소 이름으로
    push할지 (아직 태그는 없음, 저장소 이름까지만).
  - `push-by-digest=true`: 태그가 아니라 **다이제스트(sha256 해시)**로만
    레지스트리에 push한다. 이러면 `latest` 같은 사람이 읽는 태그가
    이 시점엔 전혀 생기지 않는다.
  - `name-canonical=true`: 출력되는 이미지 참조에 다이제스트를 포함한
    정규화된 형태를 쓰도록 강제 — 다음 스텝에서 `steps.build.outputs.digest`
    (§5)로 정확한 다이제스트 값을 꺼낼 수 있게 해준다.
  - `push=true`: 빌드를 실행 중인 러너(VM) 안에 이미지를 만들고
    끝내는 게 아니라, 실제로 레지스트리(GHCR)까지 push한다.
- `cache-from`/`cache-to`: 이전 빌드의 레이어 캐시를 GitHub Actions
  캐시 저장소에서 읽고(`cache-from`) 쓴다(`cache-to`). `scope:
  ${{ matrix.suffix }}`를 붙인 이유는, amd64와 arm64가 **같은 워크플로
  안에서 동시에** 캐시를 쓰고 쓰기 때문이다. scope 없이 캐시를 공유하면
  서로 다른 아키텍처의 빌드 레이어가 뒤섞여 캐시가 오염될 수 있어,
  `amd64`/`arm64` 스코프로 캐시 공간 자체를 분리했다.
  `mode=max`는 중간 빌드 스테이지(멀티스테이지 Dockerfile의 `deps`,
  `builder` 등)의 레이어까지 전부 캐시하라는 뜻 — 기본값(`mode=min`)은
  최종 이미지 레이어만 캐시해서 재사용 폭이 좁다.

```mermaid
flowchart TD
    A["strategy.matrix"] --> B["조합 1:<br/>platform=linux/amd64<br/>runner=ubuntu-latest"]
    A --> C["조합 2:<br/>platform=linux/arm64<br/>runner=ubuntu-24.04-arm"]
    B --> D["job 인스턴스 #1<br/>(amd64 러너에서 실행)"]
    C --> E["job 인스턴스 #2<br/>(arm64 러너에서 실행)"]
    D --> F["이 안에서<br/>matrix.platform = linux/amd64 하나뿐"]
    E --> G["이 안에서<br/>matrix.platform = linux/arm64 하나뿐"]
```
```
  strategy:
    matrix:
      include:
        - platform: linux/amd64
          runner: ubuntu-latest
        - platform: linux/arm64
          runner: ubuntu-24.04-arm
  ```
---

## 9. job 사이에 파일 전달: `upload-artifact` / `download-artifact`

matrix로 나뉜 두 job(`build-and-push`)의 결과물을, 그 다음 job
(`push-ghcr`)에서 합쳐야 했다. job은 서로 다른 러너(가상머신)에서
실행되므로 파일시스템을 공유하지 않는다 — 그래서 "아티팩트"라는
메커니즘으로 파일을 주고받는다.

아래 예시의 `/tmp/digests`는 세 job(amd64용, arm64용, `push-ghcr`용)
모두에서 동일한 경로 문자열이지만, 실제로는 **매번 새로 뜨는 별개의
러너 VM 안의 로컬 경로**다. amd64 VM과 arm64 VM은 각자의 `/tmp/digests`에
파일을 쓴 뒤 아티팩트로 업로드하고 나면 VM째로 사라지고, `push-ghcr`
job은 또 다른 새 VM에서 그 아티팩트들을 다운로드해 자신의
`/tmp/digests`에 풀어놓는 것이다. 즉 같은 경로처럼 보여도 물리적으로는
세 개의 다른 디스크 위치이며, 아티팩트 업로드/다운로드가 그 사이를
이어주는 유일한 통로다.

**올리는 쪽 (`build-and-push`, matrix로 2번 실행됨)**
```yaml
- name: 다이제스트 아티팩트 저장
  run: |
    mkdir -p /tmp/digests
    digest="${{ steps.build.outputs.digest }}"
    touch "/tmp/digests/${digest#sha256:}"

- uses: actions/upload-artifact@v4
  with:
    name: digests-${{ matrix.suffix }}
    path: /tmp/digests/*
    if-no-files-found: error
    retention-days: 1
```
- 다이제스트 값을 파일 이름으로 쓰는 빈 파일을 만들고(`touch`), 그
  디렉토리를 통째로 업로드한다. `name`을 matrix마다 다르게
  (`digests-amd64`, `digests-arm64`) 지어서 두 아티팩트가 서로 다른
  이름으로 저장되게 했다 — 같은 이름을 쓰면 충돌한다.
- `if-no-files-found: error`: 업로드할 파일이 하나도 없으면 이 스텝을
  실패로 처리해서, 조용히 넘어가는 것을 방지.
- `retention-days: 1`: 아티팩트 보관 기간. 다음 job에서 바로 쓰고 버릴
  임시 파일이라 짧게 설정.

**받는 쪽 (`push-ghcr`)**
```yaml
- name: 다이제스트 아티팩트 다운로드
  uses: actions/download-artifact@v4
  with:
    path: /tmp/digests
    pattern: digests-*
    merge-multiple: true
```
- `pattern: digests-*`로 이름이 `digests-`로 시작하는 아티팩트를 전부
  선택 (즉 `digests-amd64`와 `digests-arm64` 둘 다).
- `merge-multiple: true`가 없으면 각 아티팩트가 자기 이름의 하위 폴더로
  나뉘어 저장되는데, 이 옵션을 주면 여러 아티팩트의 파일들을 지정한
  `path` 아래 하나로 합쳐 저장한다 — 그래서 `push-ghcr`의 다음 스텝이
  `/tmp/digests` 안에서 amd64/arm64 다이제스트 파일 두 개를 한 번에
  찾을 수 있다.

---

## 10. `permissions` — GITHUB_TOKEN의 권한 범위 지정

```yaml
permissions:
  contents: read
  packages: write
```

- 워크플로 실행마다 자동 발급되는 `GITHUB_TOKEN`은 기본적으로 제한된
  권한만 갖는다. GHCR에 이미지를 push하려면 `packages: write` 권한이
  필요한데, 이걸 명시적으로 선언해야 `docker/login-action`에
  `secrets.GITHUB_TOKEN`을 넘겼을 때 실제로 push 권한이 생긴다.
- `contents: read`는 저장소 코드를 체크아웃하는 데 필요한 최소 권한.
  "필요한 권한만 최소로 부여한다"는 보안 원칙(최소 권한 원칙)을 따른
  것 — 기본값보다 더 넓은 권한을 굳이 열어두지 않는다.

---

## 11. `uses` vs `run` — 액션을 쓸지, 셸 명령을 쓸지

```yaml
- name: 저장소 체크아웃
  uses: actions/checkout@v4

- name: 의존성 설치
  run: pnpm install --frozen-lockfile
```

- `uses`: 다른 사람(또는 GitHub, Docker 등)이 미리 만들어 공개해 둔
  **재사용 가능한 액션**을 가져다 쓴다. `owner/repo@버전` 형식이고,
  버전은 보통 메이저 버전 태그(`@v4` 등)를 쓴다.
- `run`: 러너의 셸에서 직접 실행할 명령어. 여러 줄이 필요하면 `run: |`
  (리터럴 블록 스칼라)로 여러 줄을 하나의 스크립트처럼 이어 쓴다.
- `with:`는 `uses`로 가져온 액션에 넘기는 입력값(파라미터)들의 모음.
  액션마다 어떤 `with` 키를 받는지는 그 액션의 문서에 정의되어 있다.

---

## 12. `working-directory` — 특정 스텝의 실행 위치 지정

```yaml
- name: 멀티플랫폼 매니페스트 생성 및 태그 부여
  working-directory: /tmp/digests
  run: |
    docker buildx imagetools create \
      ...
      $(printf 'ghcr.io/${{ github.repository }}@sha256:%s ' *)
```

- 기본적으로 모든 `run` 스텝은 저장소를 체크아웃한 디렉토리에서
  실행되는데, `working-directory`로 특정 스텝만 다른 디렉토리에서
  실행하게 바꿀 수 있다. 여기서는 다운로드해 둔 다이제스트 파일들이
  있는 `/tmp/digests`로 옮겨서, `*`(글롭 패턴)가 그 디렉토리 안의
  다이제스트 파일 이름들만 정확히 매칭하게 했다.

---

## 13. 여러 줄 셸 스크립트 안에서 워크플로 컨텍스트 값을 함께 쓰기

```yaml
run: |
  ssh -i ~/.ssh/deploy_key -p 2222 \
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
```

- `run: |`은 YAML의 리터럴 블록 스칼라 문법으로, 들여쓴 부분 전체를
  줄바꿈까지 그대로 유지한 채 하나의 문자열(셸 스크립트)로 취급한다.
- `<<'EOF' ... EOF`는 GitHub Actions 고유 문법이 아니라 **bash의
  here-document** 문법. `deployer@localhost` 원격 서버로 보낼 스크립트
  본문을 SSH 명령의 표준 입력으로 그대로 전달한다. 작은따옴표
  (`<<'EOF'`)를 쓰면 그 안의 `$변수` 같은 것이 로컬(러너) 셸에서
  미리 치환되지 않고 원격 서버에서 그대로 해석되게 막는다 — 여기서는
  치환할 변수가 없어 큰 의미는 없지만, 원격으로 스크립트를 보낼 때
  안전한 관용구다.
- `docker buildx imagetools create` 스텝의 아래 두 줄은 GitHub Actions
  문법이 아니라 **셸의 명령어 치환**(`$(...)`)이다:
  ```
  $(jq -cr '.tags | map("-t " + .) | join(" ")' <<< "$DOCKER_METADATA_OUTPUT_JSON")
  $(printf 'ghcr.io/${{ github.repository }}@sha256:%s ' *)
  ```
  `${{ github.repository }}`처럼 `${{ }}`로 감싼 부분만 GitHub Actions가
  워크플로 실행 전에 텍스트로 미리 치환하고, `$(...)`나 `$DOCKER_METADATA_OUTPUT_JSON`
  같은 셸 문법은 러너의 bash가 실제로 실행할 때 해석한다. 즉 한 줄
  안에서도 "GitHub Actions가 미리 치환하는 부분"과 "셸이 나중에
  실행하는 부분"이 섞여 있다는 점을 구분해서 읽어야 한다.
  (`DOCKER_METADATA_OUTPUT_JSON`은 `docker/metadata-action`이 자동으로
  만들어주는 환경변수로, `id: meta` 스텝의 출력 전체를 JSON으로 담고 있다.)
