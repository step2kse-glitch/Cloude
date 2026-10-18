---
name: gemini-image
description: 구글 제미나이(나노바나나)로 한 구절 묵상 카드뉴스의 표지·7번째 장 배경 이미지를 바로 생성한다. "제미나이로 이미지 만들어", "나노바나나로 그려줘", 시리즈 프롬프트 파일(series/*-image-prompts.txt)을 이미지로 만들 때 사용.
---

# 제미나이 이미지 생성

드라이브를 거치지 않고, 시리즈 프롬프트 파일을 제미나이 API로 바로 이미지로 만든다.

## 준비
- 키: Google AI Studio(https://aistudio.google.com/apikey)에서 발급한 `GEMINI_API_KEY`.
  - 키는 저장소에 절대 넣지 않는다. 사용자가 준 값은 scratchpad의 `.gemini-key`(권한 600)에만 두고, 명령에는 `GEMINI_API_KEY=$(cat <scratchpad>/.gemini-key)`로 넘긴다.
  - 출력에서 키가 보이지 않게 한다.
- 이미지 생성은 유료일 수 있다. 무료 한도를 넘으면 오류가 나니, 오류 메시지를 그대로 사용자에게 알린다.

## 실행
```bash
GEMINI_API_KEY=$(cat <scratchpad>/.gemini-key) \
  node scripts/gemini-image.mjs --file series/1john-image-prompts.txt --id 1jn
```
- 결과: `carousel/images/<id>-NN-cover.png`(표지), `<id>-NN-key.png`(7번째 장)
- 이미 있는 파일은 건너뛴다. 다시 만들려면 `--force`, 한 편만은 `--only 03`.
- 모델 기본값은 `gemini-2.5-flash-image`(나노바나나). 바꾸려면 `--model`.
- 비율 기본값은 카드뉴스용 `4:5`.

## 만든 뒤
1. 이미지를 읽어 확인하고, 사람 손·얼굴이 어색하거나 글자가 들어간 장은 `--only NN --force`로 다시 만든다.
2. 사용자에게 미리보기를 보여 주고 확인을 받는다.
3. 에피소드 JSON의 `bg`에 경로를 넣고 `node scripts/render.mjs <episode-id>`로 카드를 만든다.
   - 표지·7번째 장은 `"bgPos": "left top", "bgSize": "auto 118%"`, 밝은 음영은 `"shade": "light"`.
