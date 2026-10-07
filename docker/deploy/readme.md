1. 배포 서버 용 도커
  **Docker(배포서버) 안에서 Docker(앱서버)를 구동**
  - ci 액션에서 터미널로 접속해서 github workflows에서 터미널로 배포 서버로 접속하여
  - 배포 서버 터미널에서 앱 서버 이미지를 다운로드 받아 docker 로 구동 시킨다. 

2. tmux 설정 추가
  - 사용자가 deployer@localhost 계정으로 로그인 하면 tmux 구동
  - 단축키 커스텀 설정 추가 (~/.config/tmux/tmux.conf)