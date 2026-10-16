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
// skin: "leather" 이면 릴스와 같은 성경 가죽 배경에 흰 글씨·노란 강조색을 쓴다.
const skin = episode.skin === 'leather';
const t = skin
  ? { ...series.theme, paper: '#1c1714', ink: '#F4EEE3', muted: 'rgba(244,238,227,.62)', accent: '#F2C14E', deep: '#1c1714', deepInk: '#F4EEE3' }
  : series.theme;
const soft = skin ? t.accent : '#E6B9A6';

// 폰트는 scripts/fetch-fonts.sh 로 carousel/fonts/ 에 받아 둔다.
const fontDir = pathToFileURL(path.join(root, 'carousel/fonts')).href;
const fontFaces = [
  ['Noto Serif KR', 700, 'NotoSerifKR-Bold'],
  ['Noto Serif KR', 900, 'NotoSerifKR-Black'],
  ['Noto Sans KR', 400, 'NotoSansKR-Regular'],
  ['Noto Sans KR', 500, 'NotoSansKR-Medium'],
  ['Noto Sans KR', 700, 'NotoSansKR-Bold'],
  ['Noto Serif Hebrew', 700, 'NotoSerifHebrew-Bold'],
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
    case 'follow':
      // 마지막 카드: 응원 인사 + 팔로우 안내
      return `<div class="kicker">${esc(s.kicker)}</div>
        <div class="phrase">${esc(s.phrase)}</div>
        <div class="rule"></div>
        <p class="body">${esc(s.body)}</p>
        <div class="follow"><img src="${pathToFileURL(path.join(root, s.logo)).href}"><span>${esc(s.handle ?? series.handle)}</span></div>`;
    case 'letter': {
      // 반전 카드: 어두운 봉투(앞 카드들)를 열면 나오는 밝은 편지지
      const logo = pathToFileURL(path.join(root, s.logo)).href;
      return `<div class="lt-to">${esc(s.to)}</div>
        <div class="lt-pre">${esc(s.pre)}</div>
        <div class="lt-big">${esc(s.big)}<span class="lt-win">${esc(s.win)}</span></div>
        <svg class="lt-brush" viewBox="0 0 600 40" preserveAspectRatio="none"><path d="M6 26 C120 8 260 34 380 18 S560 10 594 22" stroke="#B8862B" stroke-width="12" fill="none" stroke-linecap="round" opacity=".85"/></svg>
        <p class="lt-body">${esc(s.body)}</p>
        <div class="lt-from"><span>${esc(s.from)}</span><img src="${logo}"></div>`;
    }
    case 'reveal': {
      // 반전 카드: 찢어진 봉투 틈으로 빛이 새어 나오고, 그 빛 속에 마지막 한 문장이 드러난다.
      const edge = (y0, seed) => {
        let r = seed;
        const rnd = () => ((r = (r * 9301 + 49297) % 233280) / 233280);
        const pts = [];
        for (let x = -20; x <= width + 20; x += 36) pts.push(`${x},${Math.round(y0 + (rnd() - 0.5) * 46)}`);
        return pts;
      };
      const top = edge(s.top ?? 440, 7), bot = edge(s.bottom ?? 900, 31).reverse();
      const logo = pathToFileURL(path.join(root, s.logo)).href;
      return `<svg class="rv-tear" viewBox="0 0 ${width} ${height}">
          <defs>
            <radialGradient id="rvg" cx="50%" cy="50%" r="65%">
              <stop offset="0" stop-color="#FFF8E6"/><stop offset=".55" stop-color="#F7DFA0"/><stop offset="1" stop-color="#E2A93B"/>
            </radialGradient>
            <filter id="rvglow" x="-20%" y="-40%" width="140%" height="180%"><feGaussianBlur stdDeviation="22"/></filter>
          </defs>
          <polygon points="${[...top, ...bot].join(' ')}" fill="#F2C14E" opacity=".55" filter="url(#rvglow)"/>
          <polygon points="${[...top, ...bot].join(' ')}" fill="url(#rvg)"/>
        </svg>
        <div class="rv-head"><div class="kicker">${esc(s.kicker)}</div><div class="rv-pre">${esc(s.pre)}</div></div>
        <div class="rv-light"><div class="rv-small">${esc(s.small)}</div><div class="rv-big">${esc(s.big)}</div></div>
        <div class="rv-foot"><p>${esc(s.body)}</p><div class="rv-brand"><img src="${logo}"><span>${esc(s.handle ?? series.handle)}</span></div></div>`;
    }
    case 'night': {
      // 마지막 카드: 도시 야경 위로 빛나는 교회 십자가
      let r = 11;
      const rnd = () => ((r = (r * 9301 + 49297) % 233280) / 233280);
      const ground = 1120;
      const stars = Array.from({ length: 70 }, () =>
        `<circle cx="${Math.round(rnd() * width)}" cy="${Math.round(rnd() * 620)}" r="${(rnd() * 1.6 + 0.6).toFixed(1)}" fill="#fff" opacity="${(rnd() * 0.6 + 0.25).toFixed(2)}"/>`).join('');
      const layer = (min, max, wmin, wmax, color, windows) => {
        let out = '', x = -30;
        while (x < width + 30) {
          const w = Math.round(wmin + rnd() * (wmax - wmin)), h = Math.round(min + rnd() * (max - min));
          out += `<rect x="${x}" y="${ground - h}" width="${w}" height="${h + 2}" fill="${color}"/>`;
          if (windows) for (let wy = ground - h + 18; wy < ground - 14; wy += 26)
            for (let wx = x + 12; wx < x + w - 14; wx += 22)
              if (rnd() < 0.22) out += `<rect x="${wx}" y="${wy}" width="9" height="12" fill="#FFD58A" opacity="${(rnd() * 0.5 + 0.45).toFixed(2)}"/>`;
          x += w + Math.round(rnd() * 8);
        }
        return out;
      };
      const cx = s.crossX ?? 760;
      const church = `<rect x="${cx - 95}" y="${ground - 190}" width="190" height="192" fill="#06080F"/>
        <polygon points="${cx - 110},${ground - 188} ${cx},${ground - 270} ${cx + 110},${ground - 188}" fill="#06080F"/>
        <rect x="${cx - 30}" y="${ground - 400}" width="60" height="150" fill="#06080F"/>
        <polygon points="${cx - 38},${ground - 398} ${cx},${ground - 470} ${cx + 38},${ground - 398}" fill="#06080F"/>
        <path d="M${cx - 18} ${ground} V${ground - 70} a18 18 0 0 1 36 0 V${ground} Z" fill="#FFCF7A" opacity=".35"/>
        <rect x="${cx - 62}" y="${ground - 150}" width="16" height="34" rx="8" fill="#FFCF7A" opacity=".4"/><rect x="${cx + 46}" y="${ground - 150}" width="16" height="34" rx="8" fill="#FFCF7A" opacity=".4"/>`;
      const crossY = ground - 600;
      const cross = (extra) => `<g ${extra}><rect x="${cx - 9}" y="${crossY}" width="18" height="128" rx="3"/><rect x="${cx - 44}" y="${crossY + 30}" width="88" height="18" rx="3"/></g>`;
      const logo = pathToFileURL(path.join(root, s.logo)).href;
      return `<svg class="nt-bg" viewBox="0 0 ${width} ${height}">
          <defs>
            <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stop-color="#070B18"/><stop offset=".55" stop-color="#15203D"/><stop offset=".83" stop-color="#3B3150"/><stop offset="1" stop-color="#6A4A4A"/>
            </linearGradient>
            <radialGradient id="halo" cx="${cx}" cy="${crossY + 64}" r="260" gradientUnits="userSpaceOnUse">
              <stop offset="0" stop-color="#FFE2A0" stop-opacity=".55"/><stop offset=".45" stop-color="#F2C14E" stop-opacity=".18"/><stop offset="1" stop-color="#F2C14E" stop-opacity="0"/>
            </radialGradient>
            <filter id="bl"><feGaussianBlur stdDeviation="9"/></filter>
          </defs>
          <rect width="${width}" height="${height}" fill="url(#sky)"/>
          ${stars}
          <circle cx="${cx}" cy="${crossY + 64}" r="260" fill="url(#halo)"/>
          ${layer(220, 480, 60, 120, '#141A2C', false)}
          ${layer(90, 300, 70, 130, '#0B0F1C', true)}
          ${church}
          ${cross('fill="#FFD27A" filter="url(#bl)" opacity=".95"')}
          ${cross('fill="#FFF6DD"')}
          <rect x="0" y="${ground}" width="${width}" height="${height - ground}" fill="#05070D"/>
        </svg>
        <div class="nt-head"><div class="kicker">${esc(s.kicker)}</div><div class="nt-big">${esc(s.big)}<span class="nt-win">${esc(s.win ?? '')}</span></div></div>
        <div class="nt-foot"><span>${esc(s.body)}</span><img src="${logo}"></div>`;
    }
    default:
      throw new Error(`알 수 없는 슬라이드 타입: ${s.type}`);
  }
}

function page(s, index, total) {
  const letter = s.type === 'letter';
  const dark = !letter && (skin || s.type === 'key' || s.type === 'cover');
  // 배경 사진(bg)이 있으면 짙은 음영을 덮어 글자가 잘 읽히게 한다.
  // shade: "light" 이면 위쪽 음영을 옅게 해 사진을 밝게 보여 주고, 글자가 놓이는 아래쪽만 짙게 둔다.
  const [a, b, c] = s.shade === 'light' ? [0.18, 0.4, 0.88] : [0.55, 0.72, 0.92];
  const bg = letter
    ? `radial-gradient(ellipse at 30% 20%, rgba(255,255,255,.55), transparent 60%), radial-gradient(ellipse at 80% 90%, rgba(150,110,60,.18), transparent 55%), repeating-linear-gradient(0deg, transparent 0 63px, rgba(140,110,70,.13) 63px 65px), #F3EAD8`
    : s.bg
    ? `linear-gradient(180deg, rgba(20,28,40,${a}) 0%, rgba(20,28,40,${b}) 45%, rgba(20,28,40,${c}) 100%), url('${pathToFileURL(path.join(root, s.bg)).href}') ${s.bgPos ?? 'center'} / ${s.bgSize ?? 'cover'} no-repeat`
    : skin ? `${t.deep} url('${pathToFileURL(path.join(root, 'brand/reel-bg-leather.png')).href}') center / cover no-repeat`
    : dark ? t.deep : 'var(--paper)';
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8">
<style>
${fontFaces}
  :root { --paper:${t.paper}; --ink:${t.ink}; --muted:${t.muted}; --accent:${t.accent}; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { width:${width}px; height:${height}px; }
  body {
    background: ${bg};
    color: ${letter ? '#2B2118' : dark ? t.deepInk : 'var(--ink)'};
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
    border: 2px solid ${letter ? 'rgba(43,33,24,.18)' : dark ? 'rgba(244,238,227,.25)' : 'rgba(31,42,58,.15)'};
    pointer-events: none;
  }
  .top, .bottom {
    position: absolute; left: 110px; right: 110px;
    display: flex; justify-content: space-between;
    font-size: 26px; letter-spacing: .04em;
    color: ${letter ? 'rgba(43,33,24,.55)' : dark ? 'rgba(244,238,227,.7)' : 'var(--muted)'};
  }
  .top { top: 80px; } .bottom { bottom: 80px; }
  .kicker { font-size: 32px; font-weight: 700; color: ${dark ? soft : 'var(--accent)'}; letter-spacing: .06em; margin-bottom: 44px; }
  h1, h2, blockquote, .word, .key, .phrase, .prayer { font-family: 'Noto Serif KR', serif; }
  .word { font-family: 'Noto Serif Hebrew', 'Noto Serif KR', serif; }
  .phrase { font-size: 76px; line-height: 1.35; font-weight: 900; color: var(--accent); }
  .prayer { font-size: 50px; line-height: 1.7; font-weight: 700; }
  .amen { margin-top: 40px; font-size: 40px; font-weight: 700; color: var(--accent); }
  .cover-title { font-size: 92px; line-height: 1.32; font-weight: 900; text-shadow: 0 2px 18px rgba(0,0,0,.35); }
  h2 { font-size: 80px; line-height: 1.3; font-weight: 900; }
  .rule { width: 90px; height: 6px; background: ${dark ? soft : 'var(--accent)'}; margin: 56px 0; }
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
  .next { margin-top: 90px; padding-top: 40px; border-top: 2px solid ${dark ? 'rgba(244,238,227,.2)' : 'rgba(31,42,58,.15)'}; font-size: 34px; line-height: 1.6; font-weight: 700; }
  .follow { margin-top: 70px; display: flex; align-items: center; gap: 30px; font-size: 40px; font-weight: 700; }
  .follow img { width: 150px; height: 150px; }
  .lt-to { font-family: 'Noto Serif KR', serif; font-size: 36px; font-weight: 700; color: rgba(43,33,24,.6); }
  .lt-pre { margin-top: 70px; font-size: 38px; color: rgba(43,33,24,.75); }
  .lt-big { margin-top: 18px; font-family: 'Noto Serif KR', serif; font-size: 118px; line-height: 1.22; font-weight: 900; color: #2B2118; }
  .lt-win { color: #9A2C22; }
  .lt-brush { width: 470px; height: 34px; margin: 6px 0 0 4px; display: block; }
  .lt-body { margin-top: 54px; font-size: 38px; line-height: 1.7; color: rgba(43,33,24,.85); }
  .lt-from { margin-top: 56px; display: flex; align-items: center; gap: 26px; font-family: 'Noto Serif KR', serif; font-size: 38px; font-weight: 700; }
  .lt-from img { width: 130px; height: 130px; }
  .rv-tear { position: absolute; inset: 0; width: 100%; height: 100%; }
  .rv-head, .rv-light, .rv-foot { position: absolute; left: 110px; right: 110px; text-align: center; }
  .rv-head { top: 175px; } .rv-head .kicker { margin-bottom: 26px; }
  .rv-pre { font-family: 'Noto Serif KR', serif; font-size: 44px; line-height: 1.5; font-weight: 700; color: rgba(244,238,227,.88); }
  .rv-light { top: 515px; color: #2A1D12; }
  .rv-small { font-family: 'Noto Serif KR', serif; font-size: 62px; font-weight: 900; letter-spacing: -.01em; }
  .rv-big { font-family: 'Noto Serif KR', serif; font-size: 190px; line-height: 1.05; font-weight: 900; letter-spacing: -.02em; }
  .rv-foot { top: 985px; }
  .rv-foot p { font-size: 36px; line-height: 1.6; color: rgba(244,238,227,.85); }
  .rv-brand { margin-top: 30px; display: flex; justify-content: center; align-items: center; gap: 22px; font-size: 34px; font-weight: 700; color: #F4EEE3; }
  .rv-brand img { width: 120px; height: 120px; }
  .nt-bg { position: absolute; inset: 0; width: 100%; height: 100%; }
  .nt-head { position: absolute; left: 110px; right: 110px; top: 170px; }
  .nt-head .kicker { margin-bottom: 30px; }
  .nt-big { font-family: 'Noto Serif KR', serif; font-size: 100px; line-height: 1.25; font-weight: 900; color: #FFF8EA; text-shadow: 0 4px 30px rgba(0,0,0,.5); }
  .nt-win { color: #F2C14E; }
  .nt-foot { position: absolute; left: 110px; right: 110px; top: 1135px; display: flex; justify-content: space-between; align-items: center; font-size: 34px; font-weight: 500; white-space: nowrap; color: rgba(244,238,227,.88); }
  .nt-foot img { width: 96px; height: 96px; }
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
