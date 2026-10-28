#!/bin/bash
# 맥용 법원경매 분석 시작 — 더블클릭 또는 터미널에서: bash 경매분석.command
cd "$(dirname "$0")" || exit 1
export PATH="$HOME/.local/bin:/usr/local/bin:/opt/homebrew/bin:$PATH"
echo "=========================================="
echo " 법원경매 AI 분석"
echo "=========================================="
if ! command -v node >/dev/null 2>&1; then
  echo "[!] Node.js가 없어요. 먼저 setup.command 를 실행하세요."; read -r -p "엔터를 누르면 닫힙니다"; exit 1
fi
if [ ! -d node_modules ]; then
  echo "[준비] 필요한 부품 설치 중..."
  npm install && npx playwright install chromium || { read -r -p "설치 오류 — 이 창을 캡처해서 Claude에게 보여주세요. 엔터"; exit 1; }
fi
echo "처음이면 채팅에 '데모' 라고 쳐서 샘플 리포트부터 보세요."
echo "예) 화성 아파트 5억 이하 투자 / 동탄 실거주 내 집 찾기"
claude "/auction $*"
