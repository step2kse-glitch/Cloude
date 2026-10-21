// 릴스 스타일: 분야 템플릿 · 색감 필터(look) · 타이포그래피 자막(textStyle) · 자막 효과(textAnim) · 강조색(accent)
// 자막은 크롬이 그린 투명 PNG → ffmpeg overlay. 필터는 ffmpeg 필터 체인.
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const W = 1080;
const H = 1920;

// ---------- 분야 템플릿 (스토리보드에 값이 없을 때의 기본값) ----------
const TEMPLATES = {
  salim: { label: '살림템 후기', look: 'bright', textStyle: 'clean', textAnim: 'fade', hookStyle: 'accent', accent: '#FFD84D', guide: 'data/reels-guide.md' },
  info: { label: '정보 릴스', look: 'vivid', textStyle: 'bigbold', textAnim: 'words', hookStyle: 'block', accent: '#FFD400', guide: 'data/reels-templates/info.md' },
  sermon: { label: '설교·말씀 릴스', look: 'moody', textStyle: 'serif', textAnim: 'fade', hookStyle: 'serif', accent: '#E9C77B', cardBackground: '#14110F', guide: 'data/reels-templates/sermon.md' },
  basic: { label: '기본', look: 'none', textStyle: 'clean', textAnim: 'fade', hookStyle: 'minimal', accent: '#FFE14D', guide: 'data/reels-guide.md' },
};

// ---------- 색감 필터: (입력 라벨, 출력 라벨, 고유 접두어) → 필터그래프 조각 ----------
const LOOKS = {
  none: { label: '원본', chain: (i, o) => `[${i}]null[${o}]` },
  bright: { label: '화사하게', chain: (i, o) => `[${i}]eq=brightness=0.035:contrast=1.04:saturation=1.12,unsharp=5:5:0.5[${o}]` },
  warm: { label: '따뜻하게', chain: (i, o) => `[${i}]colorbalance=rs=0.06:gs=0.02:bs=-0.06:rm=0.05:bm=-0.05,eq=saturation=1.08[${o}]` },
  cool: { label: '시원하게', chain: (i, o) => `[${i}]colorbalance=rs=-0.05:bs=0.07:rm=-0.03:bm=0.05,eq=saturation=0.96:contrast=1.03[${o}]` },
  vivid: { label: '선명하게', chain: (i, o) => `[${i}]eq=saturation=1.35:contrast=1.08,unsharp=5:5:0.6[${o}]` },
  film: { label: '필름', chain: (i, o) => `[${i}]eq=contrast=0.92:saturation=0.82:brightness=0.02,colorbalance=rs=0.04:bs=-0.03:rh=0.03,noise=alls=7:allf=t,vignette=PI/5[${o}]` },
  mono: { label: '흑백', chain: (i, o) => `[${i}]hue=s=0,eq=contrast=1.14:brightness=-0.01,vignette=PI/6[${o}]` },
  soft: {
    label: '몽글몽글',
    // 함정: YUV에서 screen 블렌드하면 색차 평면까지 섞여 분홍빛이 돈다 → RGB(gbrp)에서 블렌드
    chain: (i, o, p) => `[${i}]format=gbrp,split[${p}a][${p}b];[${p}b]gblur=sigma=22[${p}g];[${p}a][${p}g]blend=all_mode=screen:all_opacity=0.32,format=yuv420p,eq=contrast=0.94:saturation=1.05[${o}]`,
  },
  moody: { label: '무드(차분·어둡게)', chain: (i, o) => `[${i}]eq=brightness=-0.06:contrast=1.1:saturation=0.78,colorbalance=bs=0.05:bm=0.03:rh=0.04,vignette=PI/4[${o}]` },
  golden: { label: '노을빛', chain: (i, o) => `[${i}]colortemperature=temperature=4600,eq=saturation=1.06:contrast=1.05,vignette=PI/5[${o}]` },
  cinematic: { label: '시네마틱(틸·오렌지)', chain: (i, o) => `[${i}]colorbalance=rs=-0.06:gs=-0.02:bs=0.08:rh=0.08:gh=0.02:bh=-0.08,eq=contrast=1.08:saturation=1.05,vignette=PI/5[${o}]` },
  pastel: { label: '파스텔', chain: (i, o) => `[${i}]eq=brightness=0.05:contrast=0.88:saturation=0.85,colorbalance=rh=0.03:bh=0.04[${o}]` },
};

const TEXT_STYLES = {
  clean: '깔끔 (그림자·하단 그라데이션)',
  glass: '흰 카드',
  editorial: '에디토리얼 명조',
  cinema: '시네마 (작고 넓은 자간)',
  outline: '굵은 외곽선',
  box: '반투명 박스',
  marker: '형광펜 강조',
  serif: '명조 감성',
  bigbold: '대형 타이포',
  minimal: '미니멀',
};
const TEXT_ANIMS = { none: '효과 없음', fade: '스르륵 나타남', slide: '아래서 올라옴', words: '한 단어씩' };
const HOOK_STYLES = { accent: '포인트 박스', minimal: '대형 + 포인트 선', glass: '흰 카드', serif: '명조 + 금색 선', block: '흰 블록 대형', yellow: '노란 박스(예전)' };
const FRAMES = { none: '없음', letterbox: '레터박스 (위아래 검은 띠)' };

const HEX = /^#[0-9a-f]{6}$/i;

function resolveStyle(sb, cut = {}) {
  const t = TEMPLATES[sb.template] || TEMPLATES.salim;
  return {
    template: TEMPLATES[sb.template] ? sb.template : 'salim',
    look: cut.look || sb.look || t.look,
    textStyle: cut.textStyle || sb.textStyle || t.textStyle,
    textAnim: cut.textAnim || sb.textAnim || t.textAnim,
    hookStyle: sb.hookStyle || t.hookStyle,
    accent: HEX.test(sb.accent || '') ? sb.accent : t.accent,
    frame: FRAMES[sb.frame] ? sb.frame : 'none',
    cardBackground: t.cardBackground || '#111111',
  };
}

function lookChain(name, inL, outL, prefix) {
  return (LOOKS[name] || LOOKS.none).chain(inL, outL, prefix);
}

// ---------- 폰트 ----------
const SANS =
  "'ReelsCustom','PretendardReels','Pretendard','Apple SD Gothic Neo','AppleSDGothicNeo','Malgun Gothic','맑은 고딕','NanumSquareRound','NanumGothic','Noto Sans CJK KR','Noto Sans KR',sans-serif";
const SERIF =
  "'ReelsSerif','GowunReels','Gowun Batang','Nanum Myeongjo','NanumMyeongjo','나눔명조','AppleMyungjo','Apple Myungjo','Batang','바탕','Noto Serif KR','Noto Serif CJK KR',serif";

const BUNDLED = {
  'Pretendard-SemiBold.otf': ['PretendardReels', 600],
  'Pretendard-Bold.otf': ['PretendardReels', 700],
  'Pretendard-ExtraBold.otf': ['PretendardReels', 800],
  'Pretendard-Black.otf': ['PretendardReels', 900],
  'GowunBatang-Regular.ttf': ['GowunReels', 400],
  'GowunBatang-Bold.ttf': ['GowunReels', 700],
};

// assets/fonts/: npm run fonts 로 받은 Pretendard·고운바탕 + 사용자가 넣은 폰트
// (사용자 폰트: 파일명에 serif·myeongjo·명조 → 명조 자리, 그 외 첫 파일 → 고딕 자리. 사용자 폰트가 우선)
// 파일 URL로 참조 → 매 자막마다 수 MB를 다시 읽지 않는다
function fontFaceCss(root) {
  const dir = path.join(root, 'assets', 'fonts');
  if (!fs.existsSync(dir)) return '';
  const files = fs.readdirSync(dir).filter((n) => /\.(ttf|otf|woff2?)$/i.test(n));
  const fmt = (f) => ({ '.ttf': 'truetype', '.otf': 'opentype', '.woff': 'woff', '.woff2': 'woff2' })[path.extname(f).toLowerCase()];
  const face = (family, f, weight) =>
    `@font-face{font-family:'${family}';src:url('${pathToFileURL(path.join(dir, f)).href}') format('${fmt(f)}');${weight ? `font-weight:${weight};` : ''}}`;
  let css = '';
  for (const f of files) if (BUNDLED[f]) css += face(BUNDLED[f][0], f, BUNDLED[f][1]);
  const user = files.filter((f) => !BUNDLED[f]);
  const serif = user.find((n) => /serif|myeongjo|myungjo|명조/i.test(n));
  const sans = user.find((n) => n !== serif);
  if (sans) css += face('ReelsCustom', sans);
  if (serif) css += face('ReelsSerif', serif);
  return css;
}

function fontStatus(root) {
  const dir = path.join(root, 'assets', 'fonts');
  const files = fs.existsSync(dir) ? fs.readdirSync(dir) : [];
  const has = (p) => files.some((f) => f.startsWith(p));
  const user = files.filter((f) => /\.(ttf|otf|woff2?)$/i.test(f) && !BUNDLED[f]);
  return { pretendard: has('Pretendard-'), gowun: has('GowunBatang-'), user };
}

// ---------- 타이포그래피 ----------
const ring = (r, color = '#000') =>
  Array.from({ length: 16 }, (_, i) => {
    const a = (i / 16) * Math.PI * 2;
    return `${(Math.cos(a) * r).toFixed(1)}px ${(Math.sin(a) * r).toFixed(1)}px 0 ${color}`;
  }).join(',');

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

// "*강조*" 표시를 단어 토큰으로: [[{w, em, space}], ...] (줄 단위)
function tokenize(text) {
  let em = false;
  return String(text)
    .split('\n')
    .map((line) => {
      const words = [];
      let cur = '';
      let curEm = em;
      const push = () => {
        if (cur) words.push({ w: cur, em: curEm });
        cur = '';
      };
      for (const ch of line) {
        if (ch === '*') {
          push();
          em = !em;
          curEm = em;
        } else if (ch === ' ') {
          push();
          curEm = em;
          if (words.length) words[words.length - 1].space = true;
        } else {
          if (!cur) curEm = em;
          cur += ch;
        }
      }
      push();
      return words;
    });
}

const plain = (text) => String(text || '').replace(/\*/g, '');
const wordCount = (text) => tokenize(text).reduce((s, l) => s + l.length, 0);

// 글자 크기 기준값 (kind × style)
function baseFontSize(item) {
  if (item.kind === 'label') return 34;
  if (item.kind === 'title') return 54;
  if (item.kind === 'hook') return { accent: 88, yellow: 86, serif: 84, block: 96, minimal: 104, glass: 80 }[item.hookStyle] || 88;
  const sub = { clean: 64, glass: 56, editorial: 70, cinema: 46, outline: 66, box: 58, marker: 64, serif: 64, bigbold: 88, minimal: 52 }[item.style] || 64;
  return item.kind === 'card' ? Math.round(sub * (item.style === 'cinema' ? 1.5 : 1.25)) : sub;
}

function maxTextWidth(kind) {
  return { hook: W - 120, label: W - 88, title: W - 120 }[kind] || W - 140;
}

// 그림자: 단단한 외곽선 대신 2겹 부드러운 그림자 (세련된 느낌)
const SOFT = '0 2px 3px rgba(0,0,0,.35),0 6px 28px rgba(0,0,0,.55)';

function styleCss(item) {
  const s = {
    clean: `.l{font-weight:700;color:#fff;line-height:1.32;letter-spacing:-0.6px;text-shadow:${SOFT}} .em{color:var(--ac)}
      ${item.kind === 'sub' ? `.scrim{position:absolute;left:0;right:0;top:${Math.round(H * 0.5)}px;height:${Math.round(H * 0.32)}px;
        background:linear-gradient(180deg,rgba(0,0,0,0),rgba(0,0,0,.38) 40%,rgba(0,0,0,.38) 62%,rgba(0,0,0,0))}` : ''}`,
    glass: `.l{font-weight:800;color:#141414;line-height:1.3;letter-spacing:-0.8px;background:rgba(255,255,255,.92);padding:10px 28px;margin:7px 0;
      border-radius:22px;box-shadow:0 12px 34px rgba(0,0,0,.28)} .em{box-shadow:inset 0 -0.36em 0 var(--ac)}`,
    editorial: `.wrap:before{content:"";display:block;width:64px;height:4px;background:var(--ac);margin:0 auto 26px}
      .l{font-family:${SERIF};font-weight:700;color:#fff;line-height:1.48;letter-spacing:-1px;text-shadow:${SOFT}}
      .em{color:var(--ac)}`,
    cinema: `.l{font-weight:600;color:#F4F1EA;line-height:1.55;letter-spacing:2px;text-shadow:0 2px 10px rgba(0,0,0,.8)} .em{color:var(--ac)}`,
    outline: `.l{font-weight:800;color:#fff;line-height:1.25;text-shadow:${ring(7)},0 6px 18px rgba(0,0,0,.5)} .em{color:var(--ac)}`,
    box: `.l{font-weight:700;color:#fff;line-height:1.3;background:rgba(0,0,0,.66);padding:8px 22px;border-radius:14px;margin:5px 0} .em{color:var(--ac)}`,
    marker: `.l{font-weight:800;color:#fff;line-height:1.35;text-shadow:${ring(6)}}
      .em{color:#111;text-shadow:none;background:linear-gradient(transparent 8%,var(--ac) 8%,var(--ac) 92%,transparent 92%);padding:0 8px;border-radius:6px}`,
    serif: `.l{font-family:${SERIF};font-weight:700;color:#fff;line-height:1.55;letter-spacing:-0.5px;
      text-shadow:0 2px 14px rgba(0,0,0,.75),0 0 3px rgba(0,0,0,.6)} .em{color:var(--ac)}`,
    bigbold: `.l{font-weight:900;color:#fff;line-height:1.15;letter-spacing:-2px;text-shadow:${ring(8)},0 8px 22px rgba(0,0,0,.5)}
      .em{color:var(--ac);font-size:1.12em}`,
    minimal: `.l{font-weight:600;color:#fff;line-height:1.4;text-shadow:0 3px 12px rgba(0,0,0,.85),0 0 2px rgba(0,0,0,.8)}
      .em{font-weight:900;color:var(--ac)}`,
  };
  return s[item.style] || s.clean;
}

function hookCss(hookStyle) {
  const accent = `.l{font-weight:900;color:#111;background:var(--ac);padding:6px 26px;margin:6px 0;border-radius:18px;line-height:1.22;letter-spacing:-1.5px;box-shadow:0 10px 28px rgba(0,0,0,.3)} .em{color:#B42318}`;
  return {
    accent,
    yellow: accent,
    minimal: `.wrap:after{content:"";display:block;width:132px;height:10px;border-radius:5px;background:var(--ac);margin:30px auto 0}
      .l{font-weight:900;color:#fff;line-height:1.12;letter-spacing:-3px;text-shadow:${SOFT}} .em{color:var(--ac)}`,
    glass: `.l{font-weight:900;color:#111;background:rgba(255,255,255,.94);padding:10px 30px;margin:6px 0;border-radius:26px;line-height:1.22;letter-spacing:-1.5px;box-shadow:0 14px 40px rgba(0,0,0,.3)}
      .em{box-shadow:inset 0 -0.38em 0 var(--ac)}`,
    serif: `.wrap:before,.wrap:after{content:"";display:block;width:120px;height:3px;background:var(--ac);margin:22px auto}
      .l{font-family:${SERIF};font-weight:700;color:#fff;line-height:1.45;text-shadow:0 3px 16px rgba(0,0,0,.8)} .em{color:var(--ac)}`,
    block: `.l{font-weight:900;color:#111;background:#fff;padding:4px 22px;margin:0;line-height:1.18;letter-spacing:-2.5px;box-shadow:0 10px 30px rgba(0,0,0,.35)}
      .em{color:#E11D48}`,
  }[hookStyle] || accent;
}

function layoutCss(item) {
  const top = { bigbold: 0.55, cinema: 0.69, editorial: 0.6 }[item.style] || 0.62;
  return {
    sub: `.wrap{position:absolute;left:70px;right:70px;top:${Math.round(H * top)}px;text-align:center}`,
    card: '.wrap{position:absolute;left:70px;right:70px;top:50%;transform:translateY(-50%);text-align:center}',
    hook: `.wrap{position:absolute;left:60px;right:60px;top:${Math.round(H * 0.155)}px;text-align:center}`,
    title: `.wrap{position:absolute;left:60px;right:60px;top:${Math.round(H * 0.1)}px;text-align:center}
      .l{font-weight:900;color:#111;background:rgba(255,255,255,.94);padding:10px 26px;border-radius:16px;line-height:1.25;letter-spacing:-1px;box-shadow:0 6px 20px rgba(0,0,0,.25)} .em{color:#E11D48}`,
    label: `.wrap{position:absolute;left:44px;top:${Math.round(H * 0.075)}px}
      .l{font-weight:700;color:#fff;background:rgba(0,0,0,.6);padding:6px 16px;border-radius:10px;line-height:1.3}`,
  }[item.kind];
}

// item: { kind: sub|card|hook|title|label, style, hookStyle, accent, text, ref, reveal, fontSize }
// → 기본 페이지(폰트 로드됨)에 끼워 넣을 { css, body }
function overlayParts(item) {
  const lines = tokenize(item.text);
  let idx = 0;
  const reveal = item.reveal ?? Infinity;
  const body = lines
    .map((words) => {
      const inner = words
        .map((t, j) => {
          const vis = idx++ < reveal ? '' : ' style="visibility:hidden"';
          // 강조 구절 안의 띄어쓰기는 강조 안에 넣어야 형광펜이 끊기지 않는다
          const inSpace = t.space && t.em && words[j + 1] && words[j + 1].em;
          return `<span class="w${t.em ? ' em' : ''}"${vis}>${esc(t.w)}${inSpace ? ' ' : ''}</span>${t.space && !inSpace ? ' ' : ''}`;
        })
        .join('');
      return `<div><span class="l">${inner || '&nbsp;'}</span></div>`;
    })
    .join('');
  const serifish = ['serif', 'editorial'].includes(item.style) || item.hookStyle === 'serif';
  const ref = item.ref
    ? `<div class="ref" style="font-family:${serifish ? SERIF : SANS};font-size:${Math.max(30, Math.round(item.fontSize * 0.5))}px;color:${serifish ? 'var(--ac)' : 'rgba(255,255,255,.9)'};margin-top:22px;font-weight:700;letter-spacing:0.5px;text-shadow:0 2px 10px rgba(0,0,0,.8)">${esc(plain(item.ref))}</div>`
    : '';
  const typo = item.kind === 'hook' ? hookCss(item.hookStyle) : ['sub', 'card'].includes(item.kind) ? styleCss(item) : '';
  const accent = HEX.test(item.accent || '') ? item.accent : '#FFE14D';
  return {
    css: `:root{--ac:${accent}} .l{display:inline-block;font-size:var(--fs);white-space:nowrap} ${layoutCss(item)} ${typo}`,
    body: `${typo.includes('.scrim') ? '<div class="scrim"></div>' : ''}<div class="wrap" style="--fs:${item.fontSize}px">${body}${ref}</div>`,
  };
}

// 자막 PNG를 찍을 기본 페이지 (폰트를 한 번만 불러온다)
function basePageHtml(root) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>${fontFaceCss(root)}
    html,body{margin:0;width:${W}px;height:${H}px;background:transparent;overflow:hidden}
    body{font-family:${SANS}} *{word-break:keep-all}</style><style id="dyn"></style></head>
    <body><div id="root"></div>
    <div style="position:absolute;left:-9999px;font-family:PretendardReels;font-weight:900">가</div>
    <div style="position:absolute;left:-9999px;font-family:PretendardReels;font-weight:700">가</div>
    <div style="position:absolute;left:-9999px;font-family:GowunReels;font-weight:700">가</div></body></html>`;
}

module.exports = {
  TEMPLATES,
  LOOKS,
  TEXT_STYLES,
  TEXT_ANIMS,
  HOOK_STYLES,
  FRAMES,
  resolveStyle,
  lookChain,
  fontStatus,
  overlayParts,
  basePageHtml,
  baseFontSize,
  maxTextWidth,
  tokenize,
  plain,
  wordCount,
};
