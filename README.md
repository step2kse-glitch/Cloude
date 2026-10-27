# 네이버 블로그 자동 작성 툴 — 살림 꿀템

사진 몇 장과 한 줄 메모를 주면, Claude Code가 사진을 직접 보고 네이버 상위노출 공식에 맞춰 글을 쓰고,
승인하면 **임시저장까지** 해줍니다. 발행 버튼은 항상 내가 누릅니다.

## 가장 쉬운 설치 (Mac)

1. GitHub 저장소 페이지 → 초록색 **Code** 버튼 → **Download ZIP** → 다운로드 폴더에서 압축 풀기 (`Cloude-main` 폴더)
2. Node.js가 없으면 nodejs.org 에서 LTS(.pkg) 설치
3. **터미널** 앱(Spotlight에서 "터미널" 검색)을 열고 아래 한 줄 붙여넣기 → 엔터:
   ```
   cd ~/Downloads/Cloude-main && bash setup.command
   ```
   마지막에 뜨는 크롬 창에서 네이버 로그인
4. 핸드폰으로 쓰려면 터미널에서:
   ```
   cd ~/Downloads/Cloude-main && bash start-phone.command
   ```
   → 핸드폰 Claude 앱 → Claude Code 에서 이 맥 세션 선택 → `/write ...`
   - 터미널 창을 닫으면 연결이 끊겨요. 실행 중엔 맥이 잠자기 하지 않아요(뚜껑은 열어두기).
   - 사진은 맥의 `input/photos/` 에 있어야 해요 (아이폰이면 AirDrop, 또는 iCloud Drive 폴더 연결).

## 가장 쉬운 설치 (Windows, 더블클릭)

1. GitHub 저장소 페이지 → 초록색 **Code** 버튼 → **Download ZIP** → 압축 풀기
2. 폴더 안의 `setup.bat` 더블클릭 → 안내대로 (마지막에 뜨는 크롬 창에서 네이버 로그인)
3. 핸드폰으로 쓰려면 `start-phone.bat` 더블클릭 → 핸드폰 Claude 앱 → Claude Code 에서 이 컴퓨터 세션 선택 → `/write ...`
   - 컴퓨터는 켜둔 상태(절전 해제)여야 해요. 사진은 컴퓨터의 `input/photos/` 에 있어야 해요
     (구글 드라이브 폴더와 연결해 두면 핸드폰으로 찍어 바로 넣을 수 있어요).

## 설치 (터미널로 직접, 최초 1회)

준비물: Node.js(LTS), Claude Code, Claude 유료 구독, 네이버 계정

```bash
git clone https://github.com/step2kse-glitch/cloude.git
cd cloude
npm install
npx playwright install chromium
claude
```

Claude Code 채팅에서:

```
/setup-login
```

크롬 창이 뜨면 직접 네이버에 로그인하세요 (패스키 가능). 비밀번호는 저장되지 않고, 로그인 세션만 `naver-profile/`에 남습니다.
**`naver-profile/` 폴더는 절대 공유·업로드하지 마세요.**

## 평소 사용법

1. `input/photos/` 에 사진을 넣는다 (영상은 `input/videos/`)
2. 채팅: `/write 다이소 배수구 클리너, 내돈내산, 2주 써보니 냄새 끝`
3. 초안·검수 보고 확인 → 승인 → 네이버 "저장 글"에서 확인 후 직접 발행

| 명령 | 하는 일 |
|---|---|
| `/write` | 사진 분석 → 질문 → 초안 → 승인 후 임시저장 |
| `/learn-style` | 벤치마킹 글을 붙여넣으면 말투·구성 학습 |
| `/analyze-trends` | 상위노출 글을 붙여넣으면 글자 수·사진 수 등 세팅값 추출 |
| `/setup-login` | 네이버 로그인 다시 하기 |

## 법원경매 AI 순회·리포트 (`auction/`)

검색 조건만 주면 Claude가 법원경매정보를 돌아다니며 물건을 모으고, 권리분석·시세·수익을 계산해
**등급(A/B/C/X)·입찰가(보수/추천/상한)·진행 일정**이 들어간 리포트를 `auction/reports/` 에 써줍니다.
입찰은 항상 내가 법원에 가서 합니다.

1. 조건 수정: `auction/data/criteria.json` (또는 채팅으로 "화성 아파트 5억 이하로 바꿔줘")
2. 채팅: `/auction` (특정 물건만: `/auction 2026타경12345`)
3. **첫 실행**은 크롬 창에서 직접 검색·상세 화면을 열어 주세요. 모든 화면이 기록되고, Claude가 이를 보고
   다음부터 자동으로 순회하도록 레시피(`auction/data/recipes/search.json`)를 채웁니다.
4. 임장·대출 상담 결과를 알려주면 입찰가를 다시 계산합니다.

| 파일 | 내용 |
|---|---|
| `auction/scripts/court_capture.js` | 사이트 순회·수집 (읽기 전용, 입찰·로그인 버튼 클릭 차단) |
| `auction/scripts/calc.js` | 취득세·이자·필요현금·입찰가 계산 — `npm run auction:calc auction/cases/example.json` |
| `auction/data/rights-guide.md` | 권리분석·임차인·리스크·등급 기준 |
| `auction/data/bidding-guide.md` | 임장 → 입찰 준비물 → 낙찰 후 일정 → 명도 |

⚠ 리포트는 참고용이며 법률·세무 자문이 아닙니다. 세율(`tax-rates.json`)은 단순화 값이라 입찰 전 꼭 재확인하세요.

## 막힐 때

- `스크립트를 실행할 수 없으므로` → PowerShell에서 `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` 후 `Y`
- `claude 용어가 인식되지 않습니다` → 터미널을 껐다 켜기
- `&&` 오류 → 명령을 한 줄씩 실행
- 그 외 모든 오류 → 오류 메시지를 그대로 Claude Code 채팅에 붙여넣기

## 주의

- 브라우저 자동화는 네이버 약관상 회색지대입니다. 본인 계정으로, 하루 1~2건만.
- 이 툴은 "초안 공장"이지 "무인 발행기"가 아닙니다. 발행 전 최종 확인과 글에 대한 책임은 작성자에게 있습니다.
- 협찬 글은 공정위 지침에 따라 협찬 표기가 자동으로 들어갑니다. 발행 전 꼭 눈으로 확인하세요.
