# Cloude — 평신도 교리공부 자동화

하이델베르크 요리문답을 한 문씩 **주해보고서**와 **인스타그램 카드뉴스(캐러셀)** 로 만드는 파이프라인입니다.

```
로고스 자료 ─▶ sources/hc-NNN/        (직접 붙여 넣기 또는 Claude in Chrome으로 정리)
                 │
                 ▼
             reports/hc-NNN.md       주해보고서 (본문 · 배경 · 단어 주해 · 신학 정리 · 적용)
                 │
                 ▼
     carousel/episodes/hc-NNN.json   카드 문구 (슬라이드 10~11장)
     carousel/episodes/hc-NNN.caption.txt  인스타 캡션 + 해시태그
                 │
                 ▼
             output/hc-NNN/NN.png    1080×1350 PNG  ─▶ 인스타 업로드 / Canva에서 다듬기
```

## 처음 한 번

```bash
npm install
./scripts/fetch-fonts.sh   # Noto Serif KR · Noto Sans KR (OFL) 내려받기
```

## 회차 만들기

```bash
npm run render -- hc-001
```

결과는 `output/hc-001/01.png ~ 11.png` 에 저장됩니다.

## 슬라이드 타입

| type | 용도 | 필드 |
|---|---|---|
| `cover` | 표지 (짙은 배경) | `kicker`, `title`, `sub`, `bg`(선택) |
| `text` | 제목 + 본문 | `title`, `body` |
| `quote` | 요리문답 대답 인용 | `kicker`, `quote`, `cite` |
| `word` | 원어 단어 하나 | `kicker`, `word`, `gloss`, `body` |
| `key` | 핵심 한 문장 (짙은 배경) | `body` |
| `list` | 나눔 질문 | `kicker`, `items[]` |
| `outro` | 암송 구절 + 다음 회차 예고 | `verse`, `cite`, `next` |

어느 슬라이드든 `"bg": "carousel/images/파일.jpg"` 를 넣으면 사진 배경 위에 짙은 음영이 덮입니다.

줄바꿈은 `\n` 으로 직접 넣습니다. 색과 계정 이름은 `carousel/series.json` 에서 바꿉니다.

## 인스타그램 게시

```bash
node scripts/publish-instagram.mjs --check          # 토큰과 계정 확인
node scripts/publish-instagram.mjs gal-01           # 미리보기 (게시 안 함)
node scripts/publish-instagram.mjs gal-01 --yes     # 실제 게시
node scripts/publish-instagram.mjs --refresh        # 토큰 기한 연장
```

- 환경 변수 `IG_ACCESS_TOKEN` (Instagram 로그인 API, `instagram_business_content_publish` 권한)
- 네트워크 허용: `graph.instagram.com`
- 카드 JPG가 GitHub에 push 되어 있어야 합니다. 인스타 서버가 공개 주소에서 이미지를 가져갑니다.
- API 캐러셀은 최대 10장입니다.

## 로고스 자료

로고스는 공개 API가 없어서, 자료는 `sources/` 폴더에 직접 넣습니다. 자세한 안내는 [`sources/README.md`](sources/README.md)를 보세요.
