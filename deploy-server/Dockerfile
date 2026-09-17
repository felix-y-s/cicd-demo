# 실습용 "로컬 Linux 배포 서버" — 실제 리눅스 서버를 흉내 낸다.
# SSH로 접속해서 그 안의 Docker로 GHCR 이미지를 pull/run하는 것이 목표.
FROM ubuntu:22.04

ENV DEBIAN_FRONTEND=noninteractive

# openssh-server: SSH 접속
# docker.io: 이 컨테이너 안에서 다시 docker 명령을 쓰기 위한 Docker 데몬 + CLI
# (실제 서버라면 Docker Engine이 이미 설치되어 있는 상태에 해당)
# tmux: SSH 접속 시 세션 유지를 위한 터미널 멀티플렉서
RUN apt-get update && apt-get install -y --no-install-recommends \
    openssh-server \
    docker.io \
    sudo \
    curl \
    ca-certificates \
    tmux \
    && rm -rf /var/lib/apt/lists/*

RUN mkdir -p /var/run/sshd

# task CLI 설치 (go-task)
RUN sh -c "$(curl --location https://taskfile.dev/install.sh)" -- -d -b /usr/local/bin

# 배포용 계정 생성 (root 직접 SSH 접속은 지양)
ARG DEPLOY_USER=deployer
RUN useradd -m -s /bin/bash ${DEPLOY_USER} \
    && usermod -aG sudo,docker ${DEPLOY_USER} \
    && echo "${DEPLOY_USER} ALL=(ALL) NOPASSWD:ALL" >> /etc/sudoers

# SSH 공개키 인증만 허용 (비밀번호 로그인 비활성화)
RUN mkdir -p /home/${DEPLOY_USER}/.ssh \
    && chmod 700 /home/${DEPLOY_USER}/.ssh \
    && chown -R ${DEPLOY_USER}:${DEPLOY_USER} /home/${DEPLOY_USER}/.ssh

COPY authorized_keys /home/${DEPLOY_USER}/.ssh/authorized_keys
RUN chmod 600 /home/${DEPLOY_USER}/.ssh/authorized_keys \
    && chown ${DEPLOY_USER}:${DEPLOY_USER} /home/${DEPLOY_USER}/.ssh/authorized_keys

# SSH 로그인 시 tmux 세션에 자동 접속 (세션이 없으면 새로 생성)
RUN printf '\nif [ -z "$TMUX" ]; then\n  tmux attach -t main || tmux new -s main\nfi\n' >> /home/${DEPLOY_USER}/.bashrc

# tmux 설정 파일 복사
COPY --chown=${DEPLOY_USER}:${DEPLOY_USER} .tmux.conf /home/${DEPLOY_USER}/.tmux.conf

# Taskfile 복사
COPY --chown=${DEPLOY_USER}:${DEPLOY_USER} Taskfile.yml /home/${DEPLOY_USER}/Taskfile.yml

RUN sed -i \
    -e 's/#PasswordAuthentication yes/PasswordAuthentication no/' \
    -e 's/#PubkeyAuthentication yes/PubkeyAuthentication yes/' \
    /etc/ssh/sshd_config

COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 22

ENTRYPOINT ["/entrypoint.sh"]
