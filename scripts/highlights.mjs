// 인스타그램 하이라이트 표지 (1080×1920). 가운데 원 안에 들어가도록 글자를 가운데 모은다.
// 사용법: node scripts/highlights.mjs  → brand/highlight-*.png
import { chromium } from 'playwright';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const font = (f) => pathToFileURL(path.join(root, 'carousel/fonts', f)).href;
const items = [
  ['start', '시작', '한 구절 묵상'],
  ['galatians', '갈라디아서', '9편'],
  ['ephesians', '에베소서', '9편'],
  ['judges', '사사기', '9편'],
  ['ruth', '룻기', '6편'],
];
const html = (big, small) => `<html><head><style>
@font-face{font-family:S;font-weight:700;src:url('${font('NotoSerifKR-Bold.ttf')}')}
@font-face{font-family:N;font-weight:500;src:url('${font('NotoSansKR-Medium.ttf')}')}
body{margin:0;width:1080px;height:1920px;background:#1F2A3A;display:flex;align-items:center;justify-content:center}
.c{width:640px;height:640px;border-radius:50%;border:4px solid rgba(244,238,227,.35);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:22px}
.b{font-family:S;font-size:${big.length > 3 ? 104 : 150}px;color:#F4EEE3;letter-spacing:-2px}
.l{width:70px;height:4px;background:#8C2F2B}
.s{font-family:N;font-size:44px;color:rgba(244,238,227,.75);letter-spacing:4px}
</style></head><body><div class="c"><div class="b">${big}</div><div class="l"></div><div class="s">${small}</div></div></body></html>`;
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1080, height: 1920 } });
for (const [id, big, small] of items) {
  // file:// 폰트를 읽으려면 페이지도 file:// 로 열어야 한다.
  const f = path.join(tmpdir(), `highlight-${id}.html`);
  writeFileSync(f, html(big, small));
  await p.goto(pathToFileURL(f).href); await p.waitForTimeout(300);
  await p.screenshot({ path: path.join(root, `brand/highlight-${id}.png`) });
}
await b.close();
console.log('done');
