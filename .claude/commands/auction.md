---
description: 법원경매 물건을 AI가 순회·수집 → 권리분석·시세·수익 계산 → 입찰가·진행 로드맵 리포트 작성
argument-hint: "조건 변경 또는 사건번호 (예: 화성 아파트 5억 이하 1회 유찰 / 2026타경12345 / 비우면 criteria.json 그대로)"
---

요청: $ARGUMENTS

`auction/CLAUDE.md` 의 절대 규칙을 먼저 읽고 따른다. 아래 순서를 건너뛰지 말 것.

## 1. 조건 확정
- `auction/data/criteria.json`, `auction/data/rights-guide.md`, `auction/data/bidding-guide.md`, `auction/data/report-template.md` 를 읽는다.
- 요청에 조건 변경이 있으면 criteria.json 에 반영하고 바뀐 항목을 보여준다.
- 투자 목적(실거주/단기매도/임대), 가용 현금, 보유 주택 수, 대출 가능 비율이 비어 있으면 **한 번에 모아 질문**한다 (세금·입찰가가 여기서 갈린다).
- 요청이 특정 사건번호면 3단계 수집에서 그 사건만 연다.

## 2. 준비 확인
- 루트에 `node_modules/` 가 없으면 `npm install` 과 `npx playwright install chromium`.
- `auction/data/recipes/search.json` 의 `verified` 확인.

## 3. 순회·수집
- verified:true → `node auction/scripts/court_capture.js --recipe auction/data/recipes/search.json --criteria auction/data/criteria.json`
- verified:false (첫 실행) → 사용자에게 안내: "크롬 창이 뜨면 검색 조건을 넣고, 목록에서 관심 물건의 상세·매각물건명세서·현황조사서·감정평가서를 열어 주세요. 다 보면 창을 닫으면 됩니다." 후
  `node auction/scripts/court_capture.js --max-minutes 25`
- 출력의 저장 폴더(`auction/raw/<시각>/`)와 status 를 확인. 접속 실패면 원인을 알리고 중단.
- 사이트 대신 사용자가 서류(PDF·캡처·텍스트)를 직접 주면 그것을 원본으로 써도 된다.

## 4. 레시피 실측·갱신 (verified:false 였거나 실패했을 때)
- `snap-*.elements.json` 과 `*-resp.json` 에서 실제 셀렉터·데이터 응답을 찾아 `search.json` 단계를 채운다. 추측 금지.
- 확인된 사실은 `auction/CLAUDE.md` "실측 지식"에, 해결한 문제는 "버그 해결 기록"에 남긴다.
- 다음 실행에서 레시피가 끝까지 성공하면 그때 `verified: true`.

## 5. 물건 정리
- `index.json` 부터 읽고 목록 → 상세 순으로 원본을 연다 (PDF·스크린샷은 Read로 직접 본다).
- criteria 의 `excludeRisks`·면적·가격 조건으로 1차 거르기 (사유 기록).
- 남은 물건마다 `auction/cases/<사건번호>.json` 작성 (형식: `auction/cases/example.json`). 원본에 없는 값은 비우고 질문 목록으로.
- 권리분석·임차인·물건 리스크를 `rights-guide.md` 순서대로 판정 → `assumedAmount` 등 반영.

## 6. 시세
- 물건마다 동일 단지·평형 실거래가를 WebSearch 로 찾는다 (국토부 실거래가 공개시스템, 부동산 시세 사이트). 출처·조회일·건수를 `marketPrice.source` 에.
- 찾지 못하면 숫자를 만들지 말고 사용자에게 시세 자료(호갱노노·네이버부동산 화면 등) 붙여넣기를 요청. 시세가 없으면 그 물건은 "계산 보류".

## 7. 계산
- 물건마다 `node auction/scripts/calc.js auction/cases/<사건번호>.json --write`
- 출력 숫자를 그대로 리포트에 옮긴다. 필요현금 > `cashAvailable` 이면 등급 X(현금 부족).

## 8. 리포트
- `report-template.md` 형식으로 `auction/reports/YYYYMMDD-<조건슬러그>.md` 작성. 등급 A > B > C > X, 같은 등급은 기준 이익 큰 순.
- 자가 검증(auction/CLAUDE.md) 수행 후 채팅으로 보고:
  - 한눈에 보기 표 + 이번 주 할 일
  - A·B 물건별 핵심 3줄 (등급 이유 · 추천/상한 입찰가 · 가장 큰 리스크)
  - 확인 필요 질문 모음
  - 리포트 파일 경로
- 마지막에 "임장 결과나 대출 상담 결과를 알려주시면 계산을 다시 돌려 입찰가를 갱신할게요." 안내.
