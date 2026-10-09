#!/bin/bash
# 맥용 처음 설치 — 더블클릭 또는 터미널에서: bash setup.command
cd "$(dirname "$0")" || exit 1
export PATH="$HOME/.local/bin:/usr/local/bin:/opt/homebrew/bin:$PATH"
echo "=========================================="
echo " 네이버 블로그 자동 작성 툴 - 처음 설치 (Mac)"
echo "=========================================="
fail() { echo; echo "[X] 오류가 났어요. 이 창을 캡처해서 Claude에게 보여주세요."; read -r -p "엔터를 누르면 닫힙니다"; exit 1; }

if ! command -v node >/dev/null 2>&1; then
  echo "[!] Node.js가 없어요. 열리는 페이지에서 LTS 버전(.pkg)을 설치한 뒤 이 파일을 다시 실행하세요."
  open "https://nodejs.org"
  read -r -p "엔터를 누르면 닫힙니다"; exit 1
fi

echo "[1/4] 필요한 부품 설치 중..."
npm install || fail
echo "[2/4] 자동화용 크롬 설치 중..."
npx playwright install chromium || fail
echo "[3/4] Claude Code 확인 중..."
if ! command -v claude >/dev/null 2>&1; then
  curl -fsSL https://claude.ai/install.sh | bash || fail
fi
echo "[4/4] 네이버 로그인 — 크롬 창이 뜨면 직접 로그인하세요 (5분 안에)"
node scripts/naver_login.js || fail
chmod +x start-phone.command 2>/dev/null
echo
echo "설치 완료! 이제 start-phone.command 를 실행하면 핸드폰에서 쓸 수 있어요."
echo "(처음 한 번은 Claude 계정 로그인 화면이 뜰 수 있어요)"
read -r -p "엔터를 누르면 닫힙니다"
