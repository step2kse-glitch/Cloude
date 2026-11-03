#!/bin/bash
# 맥: 매일 자동 실행 끄기
PLIST="$HOME/Library/LaunchAgents/kr.cloude.auction-daily.plist"
launchctl unload "$PLIST" 2>/dev/null
rm -f "$PLIST"
echo "✅ 매일 자동 실행을 껐어요."
read -r -p "엔터를 누르면 닫힙니다"
