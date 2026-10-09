---
description: 네이버 로그인 창을 띄워 세션을 저장 (최초 1회 또는 로그인 만료 시)
---

1. `node_modules/` 가 없으면 먼저 `npm install` 과 `npx playwright install chromium` 을 실행한다.
2. 사용자에게 안내: "잠시 후 크롬 창이 뜨면 직접 네이버에 로그인해 주세요 (패스키 가능, 비밀번호는 저장되지 않아요). 5분 안에 완료해 주세요."
3. `node scripts/naver_login.js` 실행.
4. 결과 안내:
   - ✅ 이면 "로그인 세션 저장 완료. 이제 /write 로 글을 쓸 수 있어요. naver-profile/ 폴더는 절대 공유하지 마세요."
   - ❌ 이면 오류 메시지를 확인하고 재시도 안내.
