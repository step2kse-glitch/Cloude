// 릴스 자막용 무료 폰트 내려받기 (SIL OFL — 상업 이용·영상 사용 가능, 폰트 파일 자체 판매만 금지)
// 사용법: node scripts/reels_fonts.js   → assets/fonts/ 에 Pretendard(고딕) + 고운바탕(명조) + 라이선스 파일
// 이미 있으면 건너뛴다. 실패해도 시스템 폰트로 동작하므로 설치를 막지 않는다(exit 0).
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DIR = path.join(ROOT, 'assets', 'fonts');
const PRE = 'https://raw.githubusercontent.com/orioncactus/pretendard/v1.3.9/packages/pretendard/dist/public/static';
const GF = 'https://raw.githubusercontent.com/google/fonts/main/ofl/gowunbatang';

const FILES = [
  ['Pretendard-SemiBold.otf', `${PRE}/Pretendard-SemiBold.otf`],
  ['Pretendard-Bold.otf', `${PRE}/Pretendard-Bold.otf`],
  ['Pretendard-ExtraBold.otf', `${PRE}/Pretendard-ExtraBold.otf`],
  ['Pretendard-Black.otf', `${PRE}/Pretendard-Black.otf`],
  ['GowunBatang-Regular.ttf', `${GF}/GowunBatang-Regular.ttf`],
  ['GowunBatang-Bold.ttf', `${GF}/GowunBatang-Bold.ttf`],
  ['LICENSE-Pretendard.txt', 'https://raw.githubusercontent.com/orioncactus/pretendard/v1.3.9/LICENSE'],
  ['LICENSE-GowunBatang.txt', `${GF}/OFL.txt`],
];

(async () => {
  fs.mkdirSync(DIR, { recursive: true });
  let ok = 0;
  for (const [name, url] of FILES) {
    const dest = path.join(DIR, name);
    if (fs.existsSync(dest) && fs.statSync(dest).size > 1000) {
      ok++;
      continue;
    }
    try {
      const r = await fetch(url);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      fs.writeFileSync(dest, Buffer.from(await r.arrayBuffer()));
      console.log(`✅ ${name}`);
      ok++;
    } catch (e) {
      console.log(`⚠️ ${name} 내려받기 실패 (${e.message}) — 시스템 폰트로 대신합니다`);
    }
  }
  console.log(`폰트 ${ok}/${FILES.length} 준비됨 → assets/fonts/`);
})();
