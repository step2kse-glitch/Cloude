#!/bin/bash
# 맥용 릴스 스튜디오 — 이 창을 닫으면 꺼져요
cd "$(dirname "$0")" || exit 1
export PATH="$HOME/.local/bin:/usr/local/bin:/opt/homebrew/bin:$PATH"
[ -d node_modules/ffmpeg-static ] || npm install
# 맥이 잠자기 하지 않도록 caffeinate 로 깨워 둡니다
( sleep 2; open "http://localhost:${REELS_PORT:-4321}/?key=$(cat drafts/reels/.studio-key 2>/dev/null)" ) &
caffeinate -dimsu node scripts/reels_studio.js
