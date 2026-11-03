#!/bin/bash
# 맥: 매일 아침 07:30 "1억으로 경매" 오늘의 물건 → 블로그 초안 준비 (임시저장·발행은 승인 후)
cd "$(dirname "$0")" || exit 1
DIR="$(pwd)"
PLIST="$HOME/Library/LaunchAgents/kr.cloude.auction-daily.plist"
mkdir -p "$HOME/Library/LaunchAgents" "$DIR/auction/workspace/daily"
cat > "$PLIST" <<PL
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>kr.cloude.auction-daily</string>
  <key>ProgramArguments</key><array>
    <string>/bin/bash</string><string>-lc</string>
    <string>export PATH="\$HOME/.local/bin:/usr/local/bin:/opt/homebrew/bin:\$PATH"; cd "$DIR" &amp;&amp; node auction/src/cli.js daily --ai</string>
  </array>
  <key>StartCalendarInterval</key><dict><key>Hour</key><integer>7</integer><key>Minute</key><integer>30</integer></dict>
  <key>StandardOutPath</key><string>$DIR/auction/workspace/daily/schedule.log</string>
  <key>StandardErrorPath</key><string>$DIR/auction/workspace/daily/schedule.log</string>
</dict></plist>
PL
launchctl unload "$PLIST" 2>/dev/null
launchctl load "$PLIST" && echo "✅ 매일 아침 7:30에 오늘의 경매 물건을 준비해요. (맥이 잠자기 중이면 깨어날 때 실행)" || echo "❌ 등록 실패 — 이 창을 캡처해서 Claude에게 보여주세요"
echo "끄려면: 매일경매-끄기.command"
read -r -p "엔터를 누르면 닫힙니다"
