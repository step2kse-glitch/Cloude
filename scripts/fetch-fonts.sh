#!/usr/bin/env bash
# Noto Serif KR / Noto Sans KR (SIL OFL 1.1) 을 carousel/fonts/ 로 내려받는다.
set -euo pipefail
dir="$(cd "$(dirname "$0")/.." && pwd)/carousel/fonts"
mkdir -p "$dir"
get() {
  [ -s "$dir/$3" ] && return
  url=$(curl -sS "https://fonts.googleapis.com/css2?family=$1:wght@$2" | grep -o 'https://[^)]*\.ttf')
  curl -sS -o "$dir/$3" "$url"
  echo "✓ $3"
}
get Noto+Serif+KR 700 NotoSerifKR-Bold.ttf
get Noto+Serif+KR 900 NotoSerifKR-Black.ttf
get Noto+Sans+KR 400 NotoSansKR-Regular.ttf
get Noto+Sans+KR 500 NotoSansKR-Medium.ttf
get Noto+Sans+KR 700 NotoSansKR-Bold.ttf
