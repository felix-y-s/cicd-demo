#!/bin/bash
# 3개 배포 서버(dev/staging/production) 컨테이너에 SSH 접속이 되는지 검증한다.
# deploy-server 컨테이너를 새로 띄우거나 재빌드한 직후 사용.
#
# 사용법:
#   ./scripts/check-ssh.sh                              # ~/.ssh/deploy_key 사용
#   ./scripts/check-ssh.sh /path/to/other_key            # 다른 개인키 지정

set -euo pipefail

SSH_KEY="${1:-$HOME/.ssh/deploy_key}"

# 환경별 포트 (docker-compose.yml의 ports 설정과 일치해야 한다)
# macOS 기본 bash(3.2)는 declare -A(연관 배열, bash 4+ 전용)를 지원하지
# 않으므로 case문으로 대체한다 — CI(Ubuntu, bash 5)에서만 동작 확인하고
# 넘어가면 로컬 macOS에서 깨지는 함정이라 주의.
port_for_env() {
  case "$1" in
    dev) echo 2224 ;;
    staging) echo 2223 ;;
    production) echo 2222 ;;
  esac
}

if [ ! -f "$SSH_KEY" ]; then
  echo "개인키를 찾을 수 없음: $SSH_KEY" >&2
  exit 1
fi

for env in dev staging production; do
  port="$(port_for_env "$env")"
  echo "=== ${env} (포트 ${port}) ==="

  # -o StrictHostKeyChecking=no: known_hosts 등록 없이 접속 (컨테이너를 재생성할 때마다
  # 호스트 키가 바뀌므로 매번 물어보지 않게 함 — 실습/로컬 전용 설정, 운영 서버에는 부적절)
  if ssh -i "$SSH_KEY" -p "$port" \
      -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o ConnectTimeout=5 \
      deployer@localhost "hostname && echo OK" 2>&1; then
    :
  else
    echo "FAILED"
  fi
  echo ""
done

# sleep 3
# for port in 2222 2223 2224; do
#   echo "=== 포트 $port ==="
#   ssh -i ~/.ssh/deploy_key -p $port -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o ConnectTimeout=5 deployer@localhost "hostname && echo OK" 2>&1 || echo "FAILED"
# done