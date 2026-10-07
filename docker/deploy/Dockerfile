# 실습용 "로컬 Linux 배포 서버" — 실제 리눅스 서버를 흉내 낸다.
# SSH로 접속해서 그 안의 Docker로 GHCR 이미지를 pull/run하는 것이 목표.
FROM ubuntu:22.04

ENV DEBIAN_FRONTEND=noninteractive

# openssh-server: SSH 접속
# docker.io: 이 컨테이너 안에서 다시 docker 명령을 쓰기 위한 Docker 데몬 + CLI
# (실제 서버라면 Docker Engine이 이미 설치되어 있는 상태에 해당)
RUN apt-get update && apt-get install -y --no-install-recommends \
    openssh-server \
    docker.io \
    sudo \
    curl \
    ca-certificates \
    tmux \
    && rm -rf /var/lib/apt/lists/*

RUN mkdir -p /var/run/sshd

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

# tmux 설정 (~/.config/tmux/tmux.conf와 동일, 플러그인 제외)
RUN mkdir -p /home/${DEPLOY_USER}/.config/tmux
COPY tmux.conf /home/${DEPLOY_USER}/.config/tmux/tmux.conf
RUN chown -R ${DEPLOY_USER}:${DEPLOY_USER} /home/${DEPLOY_USER}/.config

# SSH 로그인 시 자동으로 tmux 세션에 진입(이미 tmux 안이면 중복 진입 방지).
# "deploy"라는 고정 세션 이름을 재사용해 재접속해도 같은 세션으로 돌아온다.
RUN echo '\n# SSH 로그인 시 tmux 자동 진입\nif [ -z "$TMUX" ] && [ -n "$SSH_CONNECTION" ]; then\n  exec tmux new-session -A -s deploy\nfi' \
    >> /home/${DEPLOY_USER}/.bashrc

RUN sed -i \
    -e 's/#PasswordAuthentication yes/PasswordAuthentication no/' \
    -e 's/#PubkeyAuthentication yes/PubkeyAuthentication yes/' \
    /etc/ssh/sshd_config

COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 22

ENTRYPOINT ["/entrypoint.sh"]
