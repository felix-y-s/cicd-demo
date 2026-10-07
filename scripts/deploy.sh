#!/bin/bash
# SSH 배포 관련 명령어 모음
# 사용법: source scripts/deploy.sh

# 배포 서버 접속 정보
DEPLOY_KEY="$HOME/.ssh/cicd-demo-deploy"
DEPLOY_PORT=2222
DEPLOY_USER="deployer"
DEPLOY_HOST="localhost"

# ── 접속 ───────────────────────────────────────────────────

# 배포 서버에 SSH 접속
deploy-ssh() {
  ssh -i "$DEPLOY_KEY" -p "$DEPLOY_PORT" "$DEPLOY_USER@$DEPLOY_HOST"
}

# 배포 서버에 원격 명령 실행
# 사용법: deploy-run <명령어>
# 예시:   deploy-run "docker ps"
deploy-run() {
  ssh -i "$DEPLOY_KEY" -p "$DEPLOY_PORT" \
    -o StrictHostKeyChecking=no \
    "$DEPLOY_USER@$DEPLOY_HOST" "$@"
}

# ── 배포 ───────────────────────────────────────────────────

# 최신 이미지 pull 후 컨테이너 재기동
deploy-update() {
  deploy-run bash -s <<'EOF'
    set -e
    docker pull ghcr.io/felix-y-s/cicd-demo:latest
    docker rm -f nest-app || true
    docker run -d --name nest-app \
      --add-host=host.docker.internal:192.168.65.254 \
      --env-file /home/deployer/app.env \
      -p 3000:3000 \
      ghcr.io/felix-y-s/cicd-demo:latest
EOF
}

# ── 헬스체크 ───────────────────────────────────────────────

# 배포 서버 앱 응답 확인
deploy-health() {
  deploy-run "curl -sf http://localhost:3000/ > /dev/null && echo '정상 응답' || echo '응답 없음'"
}

# 배포 서버 컨테이너 상태 확인
deploy-status() {
  deploy-run "docker ps --filter name=nest-app --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'"
}

# 앱 로그 확인 (마지막 50줄)
deploy-logs() {
  deploy-run "docker logs --tail 50 nest-app"
}

# 배포 서버 포트 포워딩 (로컬에서 배포 서버 앱 직접 접근)
deploy-tunnel() {
  ssh -i "$DEPLOY_KEY" -p "$DEPLOY_PORT" \
    -L 3000:localhost:3000 \
    "$DEPLOY_USER@$DEPLOY_HOST"
}

# 사용 가능한 명령어 목록 출력
deploy-help() {
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
  echo -e "${BOLD}${CYAN}│                     배포 명령어 치트시트                        │${RESET}"
  echo -e "${BOLD}${CYAN}└─────────────────────────────────────────────────────────────────┘${RESET}"
  echo -e "  ${GRAY}접속 정보: $DEPLOY_USER@$DEPLOY_HOST -p $DEPLOY_PORT${RESET}"

  echo ""
  echo -e "${BOLD}${YELLOW}▌ 접속${RESET}"
  echo -e "  ${GREEN}deploy-ssh${RESET}"
  echo -e "  배포 서버에 SSH로 직접 접속한다. 서버 상태를 직접 확인하거나 수동 작업이 필요할 때 사용."
  echo -e "  ${GRAY}→ ssh -i <key> -p $DEPLOY_PORT $DEPLOY_USER@$DEPLOY_HOST${RESET}"
  echo -e "  ${BLUE}  · -i      : 인증에 사용할 SSH 개인키 경로 지정${RESET}"
  echo -e "  ${BLUE}  · -p      : 접속할 포트 번호 (기본 22가 아닌 $DEPLOY_PORT 사용)${RESET}"
  echo ""
  echo -e "  ${GREEN}deploy-run${RESET} <명령어>"
  echo -e "  배포 서버에 SSH로 접속해 명령어를 실행하고 결과를 로컬에 출력한다."
  echo -e "  ${GRAY}→ ssh -i <key> -p $DEPLOY_PORT -o StrictHostKeyChecking=no $DEPLOY_USER@$DEPLOY_HOST <명령어>${RESET}"
  echo -e "  ${GRAY}예) deploy-run \"docker ps\"${RESET}"
  echo -e "  ${BLUE}  · -o StrictHostKeyChecking=no : 최초 접속 시 호스트 키 확인 생략 (자동화 용도)${RESET}"

  echo ""
  echo -e "${BOLD}${YELLOW}▌ 배포${RESET}"
  echo -e "  ${GREEN}deploy-update${RESET}"
  echo -e "  GHCR에서 최신 이미지를 pull 받아 기존 컨테이너를 교체한다. 새 버전 배포 시 사용."
  echo -e "  ${GRAY}→ docker pull <image> && docker rm -f nest-app && docker run ...${RESET}"
  echo -e "  ${BLUE}  · docker pull         : 레지스트리에서 최신 이미지 다운로드${RESET}"
  echo -e "  ${BLUE}  · docker rm -f        : 기존 컨테이너 강제 삭제 (없어도 오류 무시)${RESET}"
  echo -e "  ${BLUE}  · bash -s <<'EOF'     : 로컬 heredoc을 원격 서버에서 스크립트로 실행${RESET}"

  echo ""
  echo -e "${BOLD}${YELLOW}▌ 헬스체크 & 모니터링${RESET}"
  echo -e "  ${GREEN}deploy-health${RESET}"
  echo -e "  배포 서버의 앱이 HTTP 요청에 정상 응답하는지 확인한다. 배포 직후 동작 여부 검증용."
  echo -e "  ${GRAY}→ curl -sf http://localhost:3000/${RESET}"
  echo -e "  ${BLUE}  · curl -sf            : 오류 시 메시지 없이 종료 코드로만 결과 반환 (스크립트 친화적)${RESET}"
  echo ""
  echo -e "  ${GREEN}deploy-status${RESET}"
  echo -e "  배포 서버에서 실행 중인 nest-app 컨테이너의 상태와 포트를 확인한다."
  echo -e "  ${GRAY}→ docker ps --filter name=nest-app --format 'table ...'${RESET}"
  echo -e "  ${BLUE}  · --filter name=      : 특정 이름의 컨테이너만 필터링${RESET}"
  echo ""
  echo -e "  ${GREEN}deploy-logs${RESET}"
  echo -e "  배포 서버 앱의 최근 로그 50줄을 출력한다. 오류 발생 시 원인 파악용."
  echo -e "  ${GRAY}→ docker logs --tail 50 nest-app${RESET}"
  echo -e "  ${BLUE}  · --tail 50           : 가장 최근 50줄만 출력${RESET}"
  echo ""
  echo -e "  ${GREEN}deploy-tunnel${RESET}"
  echo -e "  포트 포워딩으로 배포 서버 앱을 로컬 브라우저에서 직접 확인한다."
  echo -e "  실행 후 http://localhost:3000 으로 접속 가능."
  echo -e "  ${GRAY}→ ssh -i <key> -p $DEPLOY_PORT -L 3000:localhost:3000 $DEPLOY_USER@$DEPLOY_HOST${RESET}"
  echo -e "  ${BLUE}  · -L 3000:localhost:3000${RESET}"
  echo -e "  ${BLUE}       ↑        ↑       ↑${RESET}"
  echo -e "  ${BLUE}       내 PC   서버 기준  서버의${RESET}"
  echo -e "  ${BLUE}       포트    호스트명   포트${RESET}"
  echo ""
}
