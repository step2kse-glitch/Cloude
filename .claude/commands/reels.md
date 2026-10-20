---
description: 사진·촬영 영상 + 한줄 메모로 릴스/쇼츠 스토리보드 작성 → 승인 후 세로 영상(자막·배경음악) 렌더링
argument-hint: "주제, 협찬 여부, 원하는 분위기 (예: 다이소 배수구 클리너, 내돈내산, 2주 써보니 냄새 끝) | --job <작업ID>"
---

입력: $ARGUMENTS

CLAUDE.md의 절대 규칙(사실 지어내기 금지·협찬 표기·가족 사생활 보호·발행 금지)과 `data/reels-guide.md`를 따른다.
**게시(업로드)는 절대 하지 않는다.** 이 명령의 끝은 "검증된 mp4 + 게시 문구"까지다.

## 0. 모드 판단
- 입력이 `--job <ID>` 로 시작하면 **스튜디오 모드** (핸드폰 웹앱에서 호출, 비대화형): 질문할 수 없다.
  - 작업 폴더 `drafts/reels/<ID>/`, 정보는 `job.json` (mode·topic·memo·sponsor·sponsorBrand·sponsorText), 자료는 `media/`.
  - 결과물은 `storyboard.json` + `review.md` 만 쓰고 **렌더링은 하지 않는다** (사용자가 앱에서 자막을 고치고 "영상 만들기"를 누르는 것이 승인).
  - 확인 안 된 사실은 넣지 말고 `review.md`의 "확인 필요"에 적는다.
- 그 외는 **채팅 모드**: 자료는 `input/photos/`(`_mosaic/` 제외)·`input/videos/`. 작업 폴더는 `drafts/reels/YYYYMMDD-HHMMSS-슬러그/` 를 새로 만든다.

## 1. 자료 읽기
- `data/reels-guide.md`, `data/blogger-profile.md`, `data/profile.md`, `data/trends.md`, `data/sponsored-disclosure.md` 를 읽는다.
- 사진은 **전부 Read로 직접 열어** 본다 (제품명·패키지 문구·가격표·사용 장면·전후 상태).
- 영상은 볼 수 없으므로 먼저 미리보기 시트를 만든다:
  `node scripts/reels_frames.js <영상 또는 폴더> --out drafts/reels/<ID>/frames`
  → 생성된 `*.sheet.jpg` 를 Read로 열어 장면별 시간(초)을 파악하고 컷의 `in`/`out`을 정한다. 소리 유무도 로그로 확인.
- HEIC 파일은 쓸 수 없다 → 채팅 모드면 jpg 변환을 요청, 스튜디오 모드면 review.md에 적는다.

## 2. 빠진 사실 확인 (채팅 모드만 질문)
- **협찬 여부**가 메모에 없으면 반드시 묻는다 (내돈내산 / 제품 제공 / 원고료 / 제품+원고료 / 업체 지정 문구).
  스튜디오 모드는 job.json의 `sponsor` 값을 따른다 (none=내돈내산, product, fee, product_fee, custom=sponsorText 사용).
- 자막에 넣고 싶은 가격·사용 기간·구매처가 확인 안 되면 묻는다(채팅) / 빼고 "확인 필요"에 적는다(스튜디오).

## 3. 개인정보 점검
- 사진·시트에서 아이 얼굴, 타인 얼굴, 번호판, 송장, 동호수, 단지 표지 등을 찾는다.
- 찾으면 해당 컷에 `blur` 영역을 넣는다 (보이는 화면 기준 0~1 좌표, 넉넉하게). 채팅 모드는 목록을 보여주고 승인받는다.
- 영상에서 대상이 움직이면 그 구간을 쓰지 않는다.

## 4. 스토리보드 작성 → `drafts/reels/<ID>/storyboard.json`
`data/reels-guide.md`의 구조·후킹 패턴(trends.md 최근 기록과 다르게)·자막 규칙대로. 형식:

```json
{
  "version": 1,
  "title": "내부용 제목",
  "mode": "photo",
  "mainKeyword": "다이소 배수구 클리너",
  "persona": "30대 중반 맞벌이 엄마, 밤 11시 배수구 냄새로 검색 중",
  "hookPattern": "반전형",
  "sponsored": false,
  "disclosure": null,
  "hook": { "text": "배수구 냄새\n닦지 말고 막으세요", "start": 0, "end": 2.5 },
  "bgm": null,
  "cuts": [
    { "type": "image", "path": "drafts/reels/<ID>/media/a.jpg", "duration": 2.5, "motion": "zoom-in", "text": "아무리 닦아도\n이틀이면 다시 냄새" },
    { "type": "video", "path": "drafts/reels/<ID>/media/b.mp4", "in": 3.0, "out": 6.5, "speed": 1, "audio": true, "text": "끼우기만 하면 끝",
      "blur": [{ "x": 0.62, "y": 0.1, "w": 0.2, "h": 0.15, "reason": "아이 얼굴" }] },
    { "type": "image", "path": "...", "duration": 2.4, "subs": [{ "text": "단점도 있어요", "start": 0, "end": 1.2 }, { "text": "2주마다 교체", "start": 1.2 }] },
    { "type": "card", "duration": 2, "text": "필요할 때 보게\n저장해 두세요", "background": "#111111" }
  ],
  "thumbnailAt": 0.6,
  "captions": {
    "instagram": "첫 줄 후킹\n요약 3~5줄\n저장 유도",
    "hashtags": ["살림템", "배수구냄새"],
    "youtubeTitle": "40자 이내",
    "youtubeDescription": "2~3줄"
  }
}
```
- 경로는 저장소 루트 기준. `motion`: zoom-in / zoom-out / pan-left / pan-right / pan-up / pan-down / none (생략 시 자동 교차).
- `fit`은 보통 생략(자동). 세로 사진의 위·아래가 잘리면 안 되면 `"fit": "contain"`.
- 영상 원본 소리에 말소리가 있으면 `"audio": true` (배경음악이 자동으로 줄어든다). 잡음뿐이면 `false`.
- `bgm`: `input/bgm/`에 파일이 있으면 분위기에 맞는 것을 `{ "path": "input/bgm/x.mp3", "volume": 0.3 }` 로. 없으면 null.
- 협찬: `sponsored: true`, `disclosure` = 짧은 라벨(reels-guide), `captions.instagram` 첫 줄 = sponsored-disclosure.md 문장.

## 5. 검수 보고
`drafts/reels/<ID>/review.md`에 쓰고(스튜디오 모드), 채팅 모드는 채팅으로도 보여준다:
- 예상 길이 / 컷 수 / 후킹 문구와 패턴 / 페르소나 / 메인 키워드
- 컷표: `#번호 | 자료 | 구간·길이 | 자막`
- 협찬 표기 (라벨 + 게시 문구 첫 줄) 또는 "내돈내산"
- 모자이크 내역 (몇 컷·몇 곳·사유) — 없으면 "발견 없음"
- 확인 필요 (지어내지 않고 뺀 사실, HEIC 등 못 쓴 자료)
- 추가 촬영 추천 (손 나오는 사용 장면, Before/After 같은 각도 등)

채팅 모드는 반드시 질문한다: **"이대로 영상을 만들까요? (자막·순서 수정할 부분이 있으면 말씀해 주세요)"**
→ 승인 전에는 렌더링하지 않는다. 스튜디오 모드는 여기서 끝.

## 6. 승인 후 렌더링 (채팅 모드)
- 수정이 잦으면 먼저 `--fast`로 미리보기, 최종은 옵션 없이:
  `node scripts/reels_render.js drafts/reels/<ID>/storyboard.json`
- 로그의 `[자동 검증]`이 전부 ✅인지 확인. ❌이면 성공 보고 금지 → 원인 수정 후 재실행.
- `drafts/reels/<ID>/check.jpg` 를 **Read로 열어** 자막 잘림·오타·모자이크 누락을 눈으로 확인. 문제 있으면 스토리보드 수정 후 재렌더.

## 7. 마무리 안내
- 완성 파일: `reel.mp4`, `thumb.jpg`, `captions.txt` 위치 안내. 스튜디오(`start-studio`)를 켜면 핸드폰에서 받아 바로 올릴 수 있다고 안내.
- 업로드 체크리스트: 협찬이면 유료 광고 라벨, 올릴 시간대(오전 9~11시·밤 9~11시), 하루 1건.
- `data/trends.md` "최근 사용 기록"에 `릴스 | 파일 | 키워드 | 후킹 패턴` 한 줄 추가 (스튜디오 모드도 추가).
- 말투·구성 교정 피드백은 `data/blogger-profile.md` 또는 `data/reels-guide.md`에 누적 기록.
