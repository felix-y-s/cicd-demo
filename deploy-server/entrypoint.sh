#!/bin/bash
set -e

# 컨테이너 안에서 Docker 데몬을 백그라운드로 기동한다.
# --storage-driver=vfs: 기본값인 overlay2는 이미 가상화된 환경(Mac Docker
# Desktop의 리눅스 VM) 안에서 또 컨테이너를 격리하는 중첩 구조에서
# overlay 마운트가 실패하는 경우가 있다(Docker-in-Docker 알려진 제약).
# vfs는 속도는 느리지만 커널 의존성이 적어 이런 중첩 가상화 환경에서도 동작한다.
dockerd --storage-driver=vfs > /var/log/dockerd.log 2>&1 &

# dockerd가 소켓을 만들 때까지 대기 (곧바로 sshd를 띄우면 docker 명령이 실패할 수 있음)
for i in $(seq 1 30); do
  if docker info > /dev/null 2>&1; then
    echo "Docker 데몬 준비 완료"
    break
  fi
  sleep 1
done

# SSH 데몬을 포그라운드로 실행 (컨테이너가 종료되지 않도록 유지)
exec /usr/sbin/sshd -D
