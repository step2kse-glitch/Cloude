// 카드뉴스 렌더러: carousel/episodes/<id>.json → output/<id>/NN.png
// 사용법: node scripts/render.mjs hc-001
import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const id = process.argv[2];
if (!id) {
  console.error('사용법: node scripts/render.mjs <episode-id>');
  process.exit(1);
}

const series = JSON.parse(await readFile(path.join(root, 'carousel/series.json'), 'utf8'));
const episode = JSON.parse(await readFile(path.join(root, `carousel/episodes/${id}.json`), 'utf8'));
const { width, height } = series.size;
const t = series.theme;

// 폰트는 scripts/fetch-fonts.sh 로 carousel/fonts/ 에 받아 둔다.
const fontDir = pathToFileURL(path.join(root, 'carousel/fonts')).href;
const fontFaces = [
  ['Noto Serif KR', 700, 'NotoSerifKR-Bold'],
  ['Noto Serif KR', 900, 'NotoSerifKR-Black'],
  ['Noto Sans KR', 400, 'NotoSansKR-Regular'],
  ['Noto Sans KR', 500, 'NotoSansKR-Medium'],
  ['Noto Sans KR', 700, 'NotoSansKR-Bold'],
]
  .map(([family, weight, file]) =>
    `@font-face{font-family:'${family}';font-weight:${weight};src:url('${fontDir}/${file}.ttf');}`)
  .join('\n');

const esc = (s = '') =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');

function slideBody(s) {
  switch (s.type) {
    case 'cover':
      return `<div class="kicker">${esc(s.kicker)}</div>
        <h1 class="cover-title">${esc(s.title)}</h1>
        <div class="rule"></div>
        <div class="sub">${esc(s.sub)}</div>`;
    case 'text':
      return `<h2>${esc(s.title)}</h2><div class="rule"></div><p class="body">${esc(s.body)}</p>`;
    case 'quote':
      return `<div class="kicker">${esc(s.kicker)}</div>
        <div class="mark">“</div>
        <blockquote class="${s.quote.split('\n').length > 7 ? 'long xlong' : s.quote.split('\n').length > 4 ? 'long' : ''}">${esc(s.quote)}</blockquote>
        <div class="cite">${esc(s.cite)}</div>`;
    case 'word':
      return `<div class="kicker">${esc(s.kicker)}</div>
        <div class="word${[...s.word].length > 9 ? ' long' : ''}">${esc(s.word)}</div>
        <div class="gloss">${esc(s.gloss)}</div>
        <div class="rule"></div>
        <p class="body">${esc(s.body)}</p>`;
    case 'key':
      return `<div class="key">${esc(s.body)}</div>`;
    case 'phrase':
      // 구절을 한 마디씩 끊어 천천히 읽는 카드
      return `<div class="kicker">${esc(s.kicker)}</div>
        <div class="phrase">${esc(s.phrase)}</div>
        <div class="rule"></div>
        <p class="body">${esc(s.body)}</p>`;
    case 'prayer':
      return `<div class="kicker">${esc(s.kicker ?? '오늘의 기도')}</div>
        <p class="prayer">${esc(s.body)}</p>
        <div class="amen">아멘.</div>`;
    case 'list':
      return `<div class="kicker">${esc(s.kicker)}</div>
        <ol class="list">${s.items.map((i) => `<li>${esc(i)}</li>`).join('')}</ol>`;
    case 'outro':
      return `<div class="mark">“</div>
        <blockquote class="verse${s.verse.split('\n').length > 3 ? ' long' : ''}">${esc(s.verse)}</blockquote>
        <div class="cite">${esc(s.cite)}</div>
        <div class="next">${esc(s.next)}</div>
        <div class="cta">${esc(s.cta ?? '저장해 두고 한 주 동안 묵상해 보세요')}</div>`;
    default:
      throw new Error(`알 수 없는 슬라이드 타입: ${s.type}`);
  }
}

function page(s, index, total) {
  const dark = s.type === 'key' || s.type === 'cover';
  // 배경 사진(bg)이 있으면 짙은 음영을 덮어 글자가 잘 읽히게 한다.
  const bg = s.bg
    ? `linear-gradient(180deg, rgba(20,28,40,.55) 0%, rgba(20,28,40,.72) 45%, rgba(20,28,40,.92) 100%), url('${pathToFileURL(path.join(root, s.bg)).href}') ${s.bgPos ?? 'center'} / cover no-repeat`
    : dark ? t.deep : 'var(--paper)';
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8">
<style>
${fontFaces}
  :root { --paper:${t.paper}; --ink:${t.ink}; --muted:${t.muted}; --accent:${t.accent}; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { width:${width}px; height:${height}px; }
  body {
    background: ${bg};
    color: ${dark ? t.deepInk : 'var(--ink)'};
    font-family: 'Noto Sans KR', sans-serif;
    word-break: keep-all;
  }
  .frame {
    position: relative; width: 100%; height: 100%;
    padding: 130px 110px 150px;
    display: flex; flex-direction: column; justify-content: center;
  }
  .frame.photo { justify-content: flex-end; padding-bottom: 190px; }
  .frame.photo .rule { margin: 40px 0; }
  .frame::before {
    content: ''; position: absolute; inset: 40px;
    border: 2px solid ${dark ? 'rgba(244,238,227,.25)' : 'rgba(31,42,58,.15)'};
    pointer-events: none;
  }
  .top, .bottom {
    position: absolute; left: 110px; right: 110px;
    display: flex; justify-content: space-between;
    font-size: 26px; letter-spacing: .04em;
    color: ${dark ? 'rgba(244,238,227,.7)' : 'var(--muted)'};
  }
  .top { top: 80px; } .bottom { bottom: 80px; }
  .kicker { font-size: 32px; font-weight: 700; color: ${dark ? '#E6B9A6' : 'var(--accent)'}; letter-spacing: .06em; margin-bottom: 44px; }
  h1, h2, blockquote, .word, .key, .phrase, .prayer { font-family: 'Noto Serif KR', serif; }
  .phrase { font-size: 76px; line-height: 1.35; font-weight: 900; color: var(--accent); }
  .prayer { font-size: 50px; line-height: 1.7; font-weight: 700; }
  .amen { margin-top: 40px; font-size: 40px; font-weight: 700; color: var(--accent); }
  .cover-title { font-size: 92px; line-height: 1.32; font-weight: 900; text-shadow: 0 2px 18px rgba(0,0,0,.35); }
  h2 { font-size: 80px; line-height: 1.3; font-weight: 900; }
  .rule { width: 90px; height: 6px; background: ${dark ? '#E6B9A6' : 'var(--accent)'}; margin: 56px 0; }
  .sub { font-size: 36px; opacity: .85; }
  .body { font-size: 40px; line-height: 1.75; color: ${dark ? t.deepInk : 'var(--ink)'}; }
  .mark { font-family: 'Noto Serif KR', serif; font-size: 200px; line-height: .6; color: var(--accent); height: 100px; }
  blockquote { font-size: 64px; line-height: 1.5; font-weight: 700; margin: 30px 0 50px; }
  blockquote.long { font-size: 50px; margin: 10px 0 36px; }
  blockquote.xlong { font-size: 44px; line-height: 1.55; }
  blockquote.verse { font-size: 76px; }
  blockquote.verse.long { font-size: 58px; margin: 20px 0 36px; }
  .cite { font-size: 32px; color: var(--muted); }
  .word { font-size: 120px; font-weight: 700; color: var(--accent); line-height: 1.1; }
  .word.long { font-size: 78px; }
  .gloss { font-size: 34px; color: var(--muted); margin-top: 24px; }
  .key { font-size: 118px; line-height: 1.35; font-weight: 900; }
  .list { list-style: none; counter-reset: q; }
  .list li { counter-increment: q; position: relative; padding-left: 90px; font-size: 42px; line-height: 1.6; margin-bottom: 56px; }
  .list li::before {
    content: counter(q); position: absolute; left: 0; top: 4px;
    width: 60px; height: 60px; border-radius: 50%;
    background: var(--accent); color: var(--paper);
    font-size: 32px; font-weight: 700; display: grid; place-items: center;
  }
  .next { margin-top: 90px; padding-top: 40px; border-top: 2px solid rgba(31,42,58,.15); font-size: 34px; line-height: 1.6; font-weight: 700; }
  .cta { margin-top: 20px; font-size: 30px; color: var(--accent); font-weight: 700; }
</style></head><body>
<div class="frame${s.bg ? ' photo' : ''}">
  <div class="top"><span>${esc(episode.series)}</span><span>${esc(episode.label)}</span></div>
  ${slideBody(s)}
  <div class="bottom"><span>${esc(series.handle)}</span><span>${index + 1} / ${total}</span></div>
</div></body></html>`;
}

const outDir = path.join(root, 'output', id);
await mkdir(outDir, { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 });
const p = await ctx.newPage();
const total = episode.slides.length;
for (const [i, s] of episode.slides.entries()) {
  // file:// 로 열어야 로컬 폰트를 읽을 수 있다.
  const html = path.join(outDir, '.slide.html');
  await writeFile(html, page(s, i, total));
  await p.goto(pathToFileURL(html).href, { waitUntil: 'load' });
  await p.evaluate(() => document.fonts.ready);
  const file = path.join(outDir, `${String(i + 1).padStart(2, '0')}.png`);
  await p.screenshot({ path: file });
  // 인스타그램 API는 JPEG만 받으므로 같은 이름의 .jpg도 만든다.
  await p.screenshot({ path: file.replace(/\.png$/, '.jpg'), type: 'jpeg', quality: 92 });
  console.log('✓', path.relative(root, file));
}
await rm(path.join(outDir, '.slide.html'), { force: true });
await browser.close();
