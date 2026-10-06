#!/bin/bash
# multi-ssh.sh
SESSION="dev-servers"
SSH_KEY_NAME="cicd-demo-deploy"      # ~/.ssh/ 밑의 공용 키 파일명
SSH_USER="deployer"
SSH_HOST="localhost"
PORTS=("2222" "2223" "2224")
LABELS=("dev1" "dev2" "dev3")   # 화면 구분용 — PORTS와 개수 반드시 맞출 것

if [ "${#PORTS[@]}" -ne "${#LABELS[@]}" ]; then
    echo "PORTS와 LABELS 배열 길이가 다릅니다. 확인해주세요." >&2
    exit 1
fi

tmux has-session -t "$SESSION" 2>/dev/null
if [ $? != 0 ]; then
    tmux new-session -d -s "$SESSION" -n "servers"

    # pane border에 라벨을 띄우기 위한 설정
    tmux set-option -t "$SESSION" pane-border-status top
    tmux set-option -t "$SESSION" pane-border-format "#{pane_title}"

    # 첫 번째 서버
    tmux send-keys -t "$SESSION" \
        "ssh -i ~/.ssh/$SSH_KEY_NAME -p ${PORTS[0]} $SSH_USER@$SSH_HOST" C-m
    tmux select-pane -t "$SESSION" -T "${LABELS[0]}"

    # 나머지 서버
    for i in "${!PORTS[@]}"; do
        [ "$i" -eq 0 ] && continue
        tmux split-window -t "$SESSION"
        tmux send-keys -t "$SESSION" \
            "ssh -i ~/.ssh/$SSH_KEY_NAME -p ${PORTS[$i]} $SSH_USER@$SSH_HOST" C-m
        tmux select-pane -T "${LABELS[$i]}"
        tmux select-layout -t "$SESSION" tiled > /dev/null
    done

    tmux select-layout -t "$SESSION" tiled
    # 입력 동시 전송은 기본 OFF — 필요할 때 prefix+y 로 토글 (아래 .tmux.conf 참고)
fi

tmux attach -t "$SESSION"