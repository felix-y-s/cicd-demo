# 배포 서버 재생성 시 체크리스트

`local-deploy-server` 컨테이너를 지우고 다시 만들 때마다 반복적으로
발생하는 문제와 해결책을 정리한다. [cicd-learning-log.md](./cicd-learning-log.md)가
"처음 어떻게 구축했는가"를 다룬다면, 이 문서는 "이미 만든 걸 지우고
다시 만들 때 무엇을 놓치기 쉬운가"를 다룬다.

이 컨테이너는 `--storage-driver=vfs` 기반 Docker-in-Docker 구조라,
컨테이너가 삭제되면 그 안의 모든 상태(내부 dockerd가 pull해둔
이미지, 떠 있던 `nest-app` 컨테이너, 수동으로 넣어둔 파일)가 함께
사라진다. 재생성은 "완전히 새로운 서버를 처음부터 만드는 것"과
동일하게 취급해야 한다.

---

## 1. `--privileged` 옵션 누락 → dockerd가 조용히 죽음

**증상**: 컨테이너 안에서 `docker info` 실행 시
```
Cannot connect to the Docker daemon at unix:///var/run/docker.sock.
Is the docker daemon running?
```

**원인**: 이 컨테이너는 내부에 Docker 데몬을 또 띄우는 구조인데,
`--privileged` 없이 실행하면 컨테이너 안에서 iptables로 NAT 체인을
만들 커널 권한이 없다. `entrypoint.sh`가 백그라운드로 `dockerd`를
띄우지만 초기화 중 아래 에러로 죽는다(로그: `docker exec
local-deploy-server cat /var/log/dockerd.log`로 확인 가능).
```
failed to register "bridge" driver: failed to create NAT chain DOCKER:
iptables --wait -t nat -N DOCKER: ... Permission denied (you must be root)
```
dockerd가 죽어도 `entrypoint.sh`의 마지막 `exec sshd -D`는 그대로
실행되므로, SSH 접속 자체는 되지만 그 안에서 `docker` 명령만
실패하는 헷갈리는 상태가 된다.

**해결**: 반드시 `--privileged`를 붙여서 실행한다.
```bash
docker run -d --name local-deploy-server --privileged \
  --add-host=host.docker.internal:host-gateway \
  -p 2222:22 \
  local-linux-deploy-server
```
`taskfiles/docker.yml`의 `run:deploy` 태스크가 이미 이 옵션을
포함하고 있으므로, 수동으로 `docker run`을 직접 치지 말고 `task
docker:run:deploy`를 쓰면 이 문제 자체를 피할 수 있다.

---

## 2. SSH 접속 시 "REMOTE HOST IDENTIFICATION HAS CHANGED"

**증상**: 재생성 후 SSH 접속 시도 시 접속이 거부되고 다음 경고가 뜬다.
```
WARNING: REMOTE HOST IDENTIFICATION HAS CHANGED!
Host key verification failed.
```

**원인**: 컨테이너를 새로 만들면 내부 sshd가 SSH 호스트 키
(`/etc/ssh/ssh_host_*`, 서버 자신의 신원을 증명하는 키)를 새로
생성한다. 같은 `localhost:2222` 주소라도 지문이 바뀌므로, 로컬
`~/.ssh/known_hosts`에 남아있는 예전 지문과 불일치해 경고가 뜬다.
이는 SSH 접속 권한을 증명하는 인증용 키 쌍(`~/.ssh/cicd-demo-deploy`)과는
**완전히 다른 키**이며, 그 키는 그대로 유효하다. 개념 설명은
[ssh-key-auth-explained.md](./ssh-key-auth-explained.md) 참고.

**해결**: 예전 지문을 지운다.
```bash
ssh-keygen -R "[localhost]:2222"
```
`taskfiles/docker.yml`의 `run:deploy` 태스크에 이 명령이 자동
실행되도록 이미 추가되어 있으므로, 위 1번과 마찬가지로 `task
docker:run:deploy`를 쓰면 수동 조치가 필요 없다.

---

## 3. `app.env` 파일 소실 → 배포 job이 `docker run`에서 실패

**증상**: GitHub Actions `deploy` job에서
```
docker: open /home/deployer/app.env: no such file or directory
```
로 실패(exit code 125). `docker rm -f nest-app`도 `No such
container: nest-app`으로 실패하지만, 스크립트에 `|| true`가 있어
이건 무시되고 진짜 원인은 아니다.

**원인**: `/home/deployer/app.env`(DATABASE_URL, JWT_SECRET 등 실제
배포 환경변수)는 **어떤 자동화 스크립트에도 생성 절차가 없고**,
과거에 수동으로 SCP/직접 작성해 서버에 넣어둔 파일이다. 컨테이너를
삭제하면 이 파일도 함께 사라진다.

**해결(임시 복구)**: 로컬 `.env.example` 값을 참고해 배포 환경에
맞게 조정한 `app.env`를 새로 작성한 뒤 SCP로 전송한다. 로컬
`.env`는 `localhost`로 각 인프라에 접속하지만, 배포 서버 컨테이너
안에서는 호스트 인프라에 `host.docker.internal`로 접속해야 하므로
주소를 바꿔야 한다.
```bash
scp -i ~/.ssh/cicd-demo-deploy -P 2222 \
  -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null \
  ./app.env deployer@localhost:/home/deployer/app.env

ssh -i ~/.ssh/cicd-demo-deploy -p 2222 \
  -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null \
  deployer@localhost "chmod 600 /home/deployer/app.env"
```

**미해결 근본 문제**: 이 파일은 여전히 컨테이너 안에만 존재하므로,
서버가 다시 삭제/재생성되면 이번과 똑같은 실패가 반복된다. 구조적
해결책 후보:
- GitHub Secrets(예: `DEPLOY_ENV_FILE`)에 전체 내용을 저장해두고,
  `deploy` job이 매번 SSH로 파일을 새로 써주는 단계를 추가
- 호스트(Mac)의 디렉토리를 배포 서버 컨테이너에 볼륨 마운트해,
  컨테이너 삭제와 무관하게 파일이 영속되도록 구성

아직 어느 쪽도 적용되지 않았으므로, 다음에 서버를 재생성할 때 이
문제가 다시 발생할 수 있다는 점을 인지하고 있을 것.

---

## 재생성 표준 절차 (요약)

1. `task docker:run:deploy` 실행 — 이미지 재빌드, `--privileged`로
   컨테이너 재기동, known_hosts 정리까지 자동 처리됨
2. `app.env`가 살아있는지 확인:
   ```bash
   ssh -i ~/.ssh/cicd-demo-deploy -p 2222 \
     -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null \
     deployer@localhost "test -f /home/deployer/app.env && echo 있음 || echo 없음"
   ```
   "없음"이면 위 3번 절차대로 재전송
3. GitHub Actions `deploy` job을 재실행하거나 `task deploy:update`로
   수동 배포해 정상 동작 확인
