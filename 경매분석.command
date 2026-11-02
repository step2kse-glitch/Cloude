#!/bin/bash
# 맥용 경매 비서 — 더블클릭하면 브라우저에 화면이 열려요 (이 창을 닫으면 화면도 꺼져요)
cd "$(dirname "$0")" || exit 1
export PATH="$HOME/.local/bin:/usr/local/bin:/opt/homebrew/bin:$PATH"
echo "=========================================="
echo " 내 경매 비서"
echo "=========================================="
if ! command -v node >/dev/null 2>&1; then
  echo "[!] Node.js가 없어요. 먼저 setup.command 를 실행하세요."; read -r -p "엔터를 누르면 닫힙니다"; exit 1
fi
if [ ! -d node_modules ]; then
  echo "[준비] 필요한 부품 설치 중..."
  npm install && npx playwright install chromium || { read -r -p "설치 오류 — 이 창을 캡처해서 Claude에게 보여주세요. 엔터"; exit 1; }
fi
echo "브라우저가 자동으로 열려요. 이 창을 닫으면 화면도 꺼져요."
node auction/src/cli.js web
