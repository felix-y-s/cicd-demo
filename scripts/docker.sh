#!/bin/bash
# Docker 관련 명령어 모음
# 사용법: source scripts/docker.sh

# ── 로컬 빌드 ──────────────────────────────────────────────

# 단순 이미지 빌드 (CI 검증용)
docker-build() {
  # 사용법: docker-build <태그명>
  # 예시:   docker-build nest-cicd-demo:local
  docker build -t "$1" .
}

# ── 멀티플랫폼 빌드 & GHCR 푸시 ───────────────────────────

# GHCR 로그인
# 사용법: GITHUB_TOKEN=<토큰> ghcr-login <github-username>
ghcr-login() {
  echo "$GITHUB_TOKEN" | docker login ghcr.io -u "$1" --password-stdin
}

# amd64/arm64 멀티플랫폼 빌드 후 GHCR에 푸시
# 사용법: docker-multi-push <github-repository> <태그>
# 예시:   docker-multi-push felix-y-s/cicd-demo latest
docker-multi-push() {
  docker buildx build \
    --platform linux/amd64,linux/arm64 \
    -t "ghcr.io/$1:$2" \
    --push .
}

# 최종 멀티플랫폼 이미지 구조 확인 (amd64/arm64 모두 포함됐는지 검증)
# 사용법: docker-inspect-image <github-repository>
docker-inspect-image() {
  docker buildx imagetools inspect "ghcr.io/$1:latest"
}

# ── 컨테이너 실행 ──────────────────────────────────────────

# 배포 서버와 동일한 조건으로 로컬 실행 (테스트용)
# 사용법: docker-run-app <env-file-경로>
# 예시:   docker-run-app ./app.env
docker-run-app() {
  docker run -d --name nest-app \
    --add-host=host.docker.internal:host-gateway \
    --env-file "$1" \
    -p 3000:3000 \
    ghcr.io/felix-y-s/cicd-demo:latest
}

# ── 정리 ───────────────────────────────────────────────────

# 실행 중인 컨테이너 목록 (보기 좋게)
alias dps='docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"'

# nest-app 컨테이너 강제 삭제
alias docker-rm-app='docker rm -f nest-app'

# 사용 가능한 명령어 목록 출력
docker-help() {
  local BOLD='\033[1m'
  local CYAN='\033[0;36m'
  local YELLOW='\033[0;33m'
  local GREEN='\033[0;32m'
  local GRAY='\033[0;90m'
  local BLUE='\033[0;34m'
  local RED='\033[0;31m'
  local RESET='\033[0m'

  echo ""
  echo -e "${BOLD}${CYAN}┌─────────────────────────────────────────────────────────────────┐${RESET}"
  echo -e "${BOLD}${CYAN}│                    Docker 명령어 치트시트                       │${RESET}"
  echo -e "${BOLD}${CYAN}└─────────────────────────────────────────────────────────────────┘${RESET}"

  echo ""
  echo -e "${BOLD}${YELLOW}▌ 로컬 빌드${RESET}"
  echo -e "  ${GREEN}docker-build${RESET} <태그>"
  echo -e "  Dockerfile을 기반으로 로컬에서 이미지를 빌드한다. CI 파이프라인 없이 빌드 결과를 빠르게 검증할 때 사용."
  echo -e "  ${GRAY}→ docker build -t <태그> .${RESET}"
  echo -e "  ${GRAY}예) docker-build nest-app:local${RESET}"
  echo -e "  ${BLUE}  · build   : 현재 디렉토리의 Dockerfile로 이미지 빌드${RESET}"
  echo -e "  ${BLUE}  · -t      : 빌드된 이미지에 <이름:태그> 형식으로 이름 부여${RESET}"
  echo -e "  ${BLUE}  · .       : 빌드 컨텍스트 경로 (Dockerfile과 함께 전송할 파일들의 범위)${RESET}"

  echo ""
  echo -e "${BOLD}${YELLOW}▌ 멀티플랫폼 & GHCR${RESET}"
  echo -e "  ${GREEN}ghcr-login${RESET} <username>"
  echo -e "  GitHub Container Registry(GHCR)에 로그인한다. 이미지 push/pull 전에 반드시 선행되어야 한다."
  echo -e "  ${GRAY}→ echo \$GITHUB_TOKEN | docker login ghcr.io -u <username> --password-stdin${RESET}"
  echo -e "  ${RED}※ GITHUB_TOKEN 환경변수 필요${RESET}"
  echo -e "  ${BLUE}  · docker login        : 컨테이너 레지스트리에 인증${RESET}"
  echo -e "  ${BLUE}  · --password-stdin    : 비밀번호를 터미널에 직접 입력하지 않고 stdin으로 받음 (보안)${RESET}"
  echo ""
  echo -e "  ${GREEN}docker-multi-push${RESET} <repo> <태그>"
  echo -e "  amd64(Intel/AMD)와 arm64(Apple M1 등) 두 아키텍처를 동시에 빌드해 GHCR에 푸시한다."
  echo -e "  ${GRAY}→ docker buildx build --platform linux/amd64,linux/arm64 -t ghcr.io/<repo>:<태그> --push .${RESET}"
  echo -e "  ${GRAY}예) docker-multi-push felix-y-s/cicd-demo latest${RESET}"
  echo -e "  ${BLUE}  · buildx              : 멀티플랫폼 빌드 기능을 제공하는 Docker CLI 플러그인${RESET}"
  echo -e "  ${BLUE}  · --platform          : 빌드 대상 CPU 아키텍처 지정${RESET}"
  echo -e "  ${BLUE}  · --push              : 빌드 완료 즉시 레지스트리에 푸시${RESET}"
  echo ""
  echo -e "  ${GREEN}docker-inspect-image${RESET} <repo>"
  echo -e "  GHCR에 올라간 이미지의 매니페스트를 확인한다. amd64/arm64가 모두 포함됐는지 검증할 때 사용."
  echo -e "  ${GRAY}→ docker buildx imagetools inspect ghcr.io/<repo>:latest${RESET}"
  echo -e "  ${GRAY}예) docker-inspect-image felix-y-s/cicd-demo${RESET}"
  echo -e "  ${BLUE}  · buildx              : 멀티플랫폼 빌드 기능을 제공하는 Docker CLI 플러그인${RESET}"
  echo -e "  ${BLUE}  · imagetools          : 레지스트리에 올라간 이미지를 pull 없이 원격에서 조회${RESET}"
  echo -e "  ${BLUE}  · inspect             : 이미지의 매니페스트(플랫폼 목록, 다이제스트, 레이어 등) 출력${RESET}"
  echo -e "  ${BLUE}  · 멀티플랫폼 매니페스트라면 amd64/arm64 각각의 다이제스트가 함께 표시됨${RESET}"

  echo ""
  echo -e "${BOLD}${YELLOW}▌ 컨테이너 실행${RESET}"
  echo -e "  ${GREEN}docker-run-app${RESET} <env-file>"
  echo -e "  배포 서버와 동일한 조건으로 로컬에서 앱 컨테이너를 실행한다. 배포 전 환경 검증용."
  echo -e "  ${GRAY}→ docker run -d --name nest-app --env-file <env-file> -p 3000:3000 ...${RESET}"
  echo -e "  ${GRAY}예) docker-run-app ./app.env${RESET}"
  echo -e "  ${BLUE}  · -d                  : 백그라운드(detach) 모드로 실행${RESET}"
  echo -e "  ${BLUE}  · --name              : 컨테이너에 이름 부여 (이후 docker stop/rm 시 이름으로 지정 가능)${RESET}"
  echo -e "  ${BLUE}  · --add-host          : 컨테이너 내부에서 호스트 머신을 host.docker.internal로 접근 가능하게 설정${RESET}"
  echo -e "  ${BLUE}  · --env-file          : 환경변수를 파일에서 일괄 주입${RESET}"
  echo -e "  ${BLUE}  · -p 3000:3000        : 호스트 3000 포트 → 컨테이너 3000 포트로 포트 포워딩${RESET}"

  echo ""
  echo -e "${BOLD}${YELLOW}▌ 단축키 (alias)${RESET}"
  echo -e "  ${GREEN}dps${RESET}"
  echo -e "  실행 중인 컨테이너 목록을 이름/상태/포트만 추려 보기 좋게 출력한다."
  echo -e "  ${GRAY}→ docker ps --format \"table {{.Names}}\\t{{.Status}}\\t{{.Ports}}\"${RESET}"
  echo -e "  ${BLUE}  · --format            : Go 템플릿으로 출력 형식 지정 (Names, Status, Ports만 추출)${RESET}"
  echo ""
  echo -e "  ${GREEN}docker-rm-app${RESET}"
  echo -e "  nest-app 컨테이너를 실행 중이더라도 강제로 삭제한다."
  echo -e "  ${GRAY}→ docker rm -f nest-app${RESET}"
  echo -e "  ${BLUE}  · -f                  : 실행 중인 컨테이너도 강제로 중지 후 삭제${RESET}"
  echo ""
}