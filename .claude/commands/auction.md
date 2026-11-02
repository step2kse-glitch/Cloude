---
description: 법원경매 — 물건 찾기·권리분석·입찰가·투입금·명도·매도/전세/월세/실거주 비교·내 집 찾기 리포트
argument-hint: "예: 화성 아파트 5억 이하 투자 / 동탄 실거주 내 집 찾기 / 2026타경12345 / 임장 결과: 관리비 체납 120만 / 데모"
---

요청: $ARGUMENTS

먼저 `auction/CLAUDE.md` 를 읽고 역할 분담과 절대 규칙을 따른다. 요청 종류를 판단해 해당 흐름만 수행한다.

## 0. 요청 종류
- **"데모"/"체험"/비어 있고 처음 사용** → `node auction/src/cli.js demo` 실행 → 생성된 html 경로 안내 + 리포트 보는 법 3줄 설명 → 끝.
- **조건 검색**(지역·가격·목적) → 1~7 전체.
- **사건번호** → 그 사건만 3(해당 사건만 열기)~7.
- **"임장 결과"/"대출 상담"/수정 요청** → 해당 케이스 JSON 갱신 → 6~7 (재평가·리포트 재작성) 후 무엇이 바뀌었는지(입찰가·등급·추천 방법) 비교해 보고.
- **"교차검증 <사건번호>"** → 아래 8.
- **"콘텐츠 <사건번호> <blog|shorts|longform>"** → 아래 9.
- **"블로그 <사건번호>"** 또는 요청에 "블로그" 포함(예: "좋은 물건은 블로그까지") → 아래 10.
- **"웹"/"화면"** → `node auction/src/cli.js web` 안내 (경매분석.command/.bat 더블클릭과 같음).

> 케이스 id = `auction/workspace/cases/<id>.json` 의 파일 이름 (사건번호의 특수문자는 `_`). 샘플은 sample-A 등.

## 1. 내 조건 확정
- `auction/config/criteria.json` 읽기. 요청의 조건을 반영하고 바뀐 항목을 보여준다.
- 아래가 비어 있거나 처음이면 **한 번에 모아 질문** (세금·입찰가·추천 방법이 여기서 갈린다):
  - 목적: 실거주 / 투자(단기매도) / 임대(전세·월세) / 상관없음(가장 유리한 방법 추천)
  - 가용 현금, 대출 가능 비율(모르면 은행 상담 전 가정치 60%), 낙찰 후 주택 수, 생애최초 여부, 조정대상지역 여부
  - 실거주면 `knowledge/home-finding.md` 2장 질문(직장·학교·방 수·입주 희망 시기·절대 안 되는 조건)
- `node auction/src/cli.js budget` 로 감당 가능한 최대 낙찰가를 보여주고, 검색 상한(`maxMinPrice`)을 그 85~90%로 제안.

## 2. 준비
- 루트에 `node_modules/` 없으면 `npm install` + `npx playwright install chromium`.
- `auction/config/recipe.json` 의 `verified` 확인.

## 3. 물건 찾기 (순회·수집)
- verified:true → `node auction/src/cli.js collect --recipe auction/config/recipe.json --criteria auction/config/criteria.json`
- verified:false → 사용자 안내 후 `node auction/src/cli.js collect --max-minutes 25`
  > "크롬 창이 뜨면 법원경매정보에서 조건을 넣어 검색하고, 관심 물건의 상세 → 매각물건명세서 → 현황조사서 → 감정평가서를 차례로 열어 주세요. 다 보면 창을 닫으면 됩니다. 보신 화면은 전부 저장되고, 다음부터는 제가 혼자 돌게 설정할게요."
- 끝나면 CLAUDE.md "순회 방식"대로 레시피 실측·갱신 + "실측 지식" 기록.
- 접속 실패면 원인 안내 후 중단. 사용자가 서류를 직접 주면 그것으로 진행.

## 4. 케이스 JSON 작성 (사실만)
- `workspace/raw/<시각>/index.json` 부터 원본을 읽는다 (PDF·스크린샷은 Read로 직접).
- 조건·`excludeRisks` 로 1차 제외(사유 기록) 후 남은 물건마다 `node auction/src/cli.js new <사건번호>` → CLAUDE.md "케이스 JSON 작성법"대로 채운다.
- 시세(`marketPrice`)·임대 시세(`rentMarket`)는 WebSearch(국토부 실거래가 공개시스템 등)로 찾아 출처 기록. 못 찾으면 비우고 사용자에게 자료 요청.
- 실거주 모드면 `homeFit` (지도 검색으로 통근·학교 확인, 출처 있는 것만).

## 5. 평가
- `node auction/src/cli.js evaluate` → 출력의 ⚠ 필수값 경고가 있으면 원본을 다시 보고 보완 후 재실행.
- 코드 판정이 원문(명세서 비고 등)과 어긋나 보이면 임의 수정하지 말고 리포트 "확인 필요"에 의견으로.

## 6. 리포트
- `node auction/src/cli.js report` → `auction/workspace/reports/*.md, *.html`
- md 를 읽고 자가 검증(CLAUDE.md) 수행.

## 7. 채팅 보고 (짧고 결정 중심)
1. 예산: 최대 낙찰가 / 이번 검토 N건 → 등급 분포
2. A·B 물건마다 3줄: **얼마에 써낼지**(추천·상한) · **얼마를 넣어야 하는지**(보증금·잔금일 현금) · **어떻게 쓰는 게 나은지**(추천 방법과 이유, 명도 난이도)
3. 실거주면 "내 집 후보 순위" 상위 3개
4. 확인 필요 질문 모음 (임장 때 확인할 것)
5. 리포트 파일 경로 (html은 핸드폰·브라우저로 열면 표가 보기 좋음)
6. 마지막 안내: "임장·대출 상담 결과를 `/auction 임장 결과: ...` 로 알려주시면 입찰가와 추천 방법을 다시 계산할게요."

## 8. 교차검증 (요청 시, 또는 A·B 등급 물건은 기본으로)
- 서브에이전트(Agent 도구)에게 **첫 번째 결과를 보여주지 말고** 같은 원본(raw 폴더·서류)만 주어
  케이스 JSON 형식(CLAUDE.md "케이스 JSON 작성법")으로 사실만 다시 추출하게 해 `auction/workspace/cases/<id>.check.json` 에 저장시킨다.
- `node auction/src/cli.js verify <id>` → 불일치 항목은 원문을 다시 보고 맞는 쪽으로 케이스 JSON 을 고친다(고친 근거를 questions 나 summary 에 남김). 판단이 안 되면 ❗ 그대로 두고 보고.
- 다시 `verify` 해서 남은 불일치를 보고.

## 9. 콘텐츠 (블로그·유튜브)
- `node auction/src/cli.js content <id> <type>` 의 사실 초안을 바탕으로 자연스러운 원고로 다듬어 `auction/workspace/content/<id>-<type>.md` 에 저장.
- 숫자·날짜·권리 판단은 초안 그대로 (새 사실 추가 금지). 주소는 동까지만, 호수·지번·임차인/채무자 정보 금지.
- 경매 글 규칙: 투자 권유 표현("무조건", "대박", "강추") 금지, 단점·위험 1개 이상, 마지막에 "투자 권유·법률 자문 아님" 문구 유지.
- shorts 는 60초 5장면(장면별 대사·화면), longform 은 섹션별 대본. 발행은 사람이 한다.

## 10. 네이버 블로그 (분석 → 글 → 승인 → 임시저장)
- `node auction/src/cli.js blog <id>` → 카드 이미지 5장 + `drafts/YYYYMMDD-auction-<id>.json` 초안 (naver_draft 형식).
- 그 JSON 의 text·quote·subtitle 만 다듬는다 (이미지·숫자·날짜·권리 판단은 그대로, 새 사실 추가 금지):
  - 루트 CLAUDE.md 의 가독성·키워드·Yes-set·홍보 냄새 제거 규칙을 따르되, 화자는 "경매 공부하며 직접 분석하는 개인"(살림 블로그 화자 설정·가족 이야기 쓰지 않기).
  - 본문 1,800~2,500자, 인용구 2~4개, 단점 1개 이상, 주소는 동까지만, 마지막 면책 문단 유지. "강추·무조건·대박·수익 보장" 금지.
- 미리보기(제목·글자 수·키워드 횟수·이미지 수 + 전문)를 보여주고 **"이대로 네이버에 임시저장할까요?"** 를 반드시 묻는다 (루트 절대 규칙 6 — 생략 금지). 비대화형 실행이면 저장하지 말고 초안 경로만 보고.
- 승인 시: `node scripts/naver_draft.js <초안>` 실행. 웹 설정의 블로그 선택이 경매 전용이면 뒤에 `--profile=naver-profile-auction` 을 붙인다
  (로그인 안 돼 있으면 `node scripts/naver_login.js --profile=naver-profile-auction` 으로 먼저 로그인 안내).
  (선택값은 `auction/workspace/settings.local.json` 의 blogTarget: main | auction)
- 루트 CLAUDE.md "자가 검증"대로 텍스트대조 결과·스크린샷 확인. ❌ 면 성공 보고 금지. 발행은 사람이 한다.
