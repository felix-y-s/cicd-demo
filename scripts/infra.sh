#!/bin/bash
# 로컬 인프라(docker compose) 관련 명령어 모음
# 사용법: source scripts/infra.sh

# ── 인프라 기동/종료 ────────────────────────────────────────

# 모든 인프라 컨테이너 기동 (백그라운드)
# Postgres, MongoDB, Redis, RabbitMQ
alias infra-up='docker compose -f docker/infra/docker-compose.yml up -d'

# 모든 인프라 컨테이너 종료
alias infra-down='docker compose -f docker/infra/docker-compose.yml down'

# 컨테이너 + 볼륨까지 완전 삭제 (데이터 초기화)
alias infra-reset='docker compose -f docker/infra/docker-compose.yml down -v'

# ── 상태 확인 ──────────────────────────────────────────────

# 인프라 컨테이너 상태 확인
alias infra-ps='docker compose -f docker/infra/docker-compose.yml ps'

# 특정 서비스 로그 확인
# 사용법: infra-logs <서비스명>
# 예시:   infra-logs postgres
infra-logs() {
  docker compose -f docker/infra/docker-compose.yml logs -f "$1"
}

# ── 데이터베이스 ───────────────────────────────────────────

# Prisma 마이그레이션 적용 (개발)
alias db-migrate='npx prisma migrate dev'

# Prisma 마이그레이션 적용 (배포용, CI와 동일)
alias db-migrate-deploy='npx prisma migrate deploy'

# Prisma Studio 실행 (GUI로 DB 조회)
alias db-studio='npx prisma studio'

# 사용 가능한 명령어 목록 출력
infra-help() {
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
  echo -e "${BOLD}${CYAN}│                  로컬 인프라 명령어 치트시트                    │${RESET}"
  echo -e "${BOLD}${CYAN}└─────────────────────────────────────────────────────────────────┘${RESET}"
  echo -e "  ${GRAY}인프라: Postgres · MongoDB · Redis · RabbitMQ${RESET}"

  echo ""
  echo -e "${BOLD}${YELLOW}▌ 인프라 기동/종료${RESET}"
  echo -e "  ${GREEN}infra-up${RESET}"
  echo -e "  docker-compose.yml에 정의된 모든 인프라 컨테이너를 백그라운드로 기동한다."
  echo -e "  ${GRAY}→ docker compose -f docker/infra/docker-compose.yml up -d${RESET}"
  echo -e "  ${BLUE}  · up    : 컨테이너 생성 및 시작 (이미지가 없으면 pull)${RESET}"
  echo -e "  ${BLUE}  · -d    : 백그라운드(detach) 모드로 실행${RESET}"
  echo ""
  echo -e "  ${GREEN}infra-down${RESET}"
  echo -e "  모든 인프라 컨테이너를 종료한다. 볼륨은 유지되므로 데이터는 보존된다."
  echo -e "  ${GRAY}→ docker compose -f docker/infra/docker-compose.yml down${RESET}"
  echo -e "  ${BLUE}  · down  : 컨테이너 중지 및 삭제 (볼륨·이미지는 유지)${RESET}"
  echo ""
  echo -e "  ${GREEN}infra-reset${RESET}"
  echo -e "  컨테이너와 볼륨을 모두 삭제해 데이터를 초기화한다. DB를 깨끗한 상태로 되돌릴 때 사용."
  echo -e "  ${GRAY}→ docker compose -f docker/infra/docker-compose.yml down -v${RESET}"
  echo -e "  ${BLUE}  · -v    : 연결된 named volume까지 함께 삭제 (데이터 완전 초기화)${RESET}"
  echo -e "  ${RED}  ※ DB 데이터가 모두 삭제되므로 주의${RESET}"

  echo ""
  echo -e "${BOLD}${YELLOW}▌ 상태 확인${RESET}"
  echo -e "  ${GREEN}infra-ps${RESET}"
  echo -e "  각 인프라 서비스의 실행 상태와 포트를 확인한다."
  echo -e "  ${GRAY}→ docker compose -f docker/infra/docker-compose.yml ps${RESET}"
  echo -e "  ${BLUE}  · ps    : 현재 프로젝트의 컨테이너 목록과 상태 출력${RESET}"
  echo ""
  echo -e "  ${GREEN}infra-logs${RESET} <서비스명>"
  echo -e "  특정 서비스의 로그를 실시간으로 출력한다. 서비스 연결 오류 진단 시 사용."
  echo -e "  ${GRAY}→ docker compose -f docker/infra/docker-compose.yml logs -f <서비스명>${RESET}"
  echo -e "  ${GRAY}예) infra-logs postgres${RESET}"
  echo -e "  ${BLUE}  · -f    : 로그를 실시간으로 스트리밍 (follow)${RESET}"
  echo -e "  ${BLUE}  · 서비스명: postgres · mongodb · redis · rabbitmq${RESET}"

  echo ""
  echo -e "${BOLD}${YELLOW}▌ 데이터베이스 (Prisma)${RESET}"
  echo -e "  ${GREEN}db-migrate${RESET}"
  echo -e "  개발 환경에서 마이그레이션을 생성하고 적용한다. 스키마 변경 후 로컬 DB에 반영할 때 사용."
  echo -e "  ${GRAY}→ npx prisma migrate dev${RESET}"
  echo -e "  ${BLUE}  · migrate dev     : 마이그레이션 파일 생성 + DB 적용 + Prisma Client 재생성${RESET}"
  echo ""
  echo -e "  ${GREEN}db-migrate-deploy${RESET}"
  echo -e "  마이그레이션 파일을 생성 없이 DB에만 적용한다. CI/CD 파이프라인과 동일한 방식."
  echo -e "  ${GRAY}→ npx prisma migrate deploy${RESET}"
  echo -e "  ${BLUE}  · migrate deploy  : 기존 마이그레이션 파일을 순서대로 적용만 함 (파일 생성 없음)${RESET}"
  echo ""
  echo -e "  ${GREEN}db-studio${RESET}"
  echo -e "  브라우저 기반 GUI로 DB 데이터를 조회·편집한다. 로컬 개발 중 데이터 확인용."
  echo -e "  ${GRAY}→ npx prisma studio${RESET}"
  echo -e "  ${BLUE}  · studio          : localhost:5555에서 Prisma Studio 실행${RESET}"
  echo ""
}
