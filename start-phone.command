#!/bin/bash
# 맥용 핸드폰 연결 모드 — 이 창을 닫으면 연결이 끊겨요
cd "$(dirname "$0")" || exit 1
export PATH="$HOME/.local/bin:/usr/local/bin:/opt/homebrew/bin:$PATH"
echo "핸드폰 연결 모드를 켭니다. 이 창을 닫으면 연결이 끊겨요."
echo "핸드폰 Claude 앱 → Claude Code 에서 이 맥 세션을 선택하세요."
echo "(맥이 잠자기 하지 않도록 caffeinate 로 깨워 둡니다)"
caffeinate -dimsu claude remote-control
