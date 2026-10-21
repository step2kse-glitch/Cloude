// 릴스 스타일: 분야 템플릿 · 색감 필터(look) · 타이포그래피 자막(textStyle) · 자막 효과(textAnim)
// 자막은 크롬이 그린 투명 PNG → ffmpeg overlay. 필터는 ffmpeg 필터 체인.
const fs = require('fs');
const path = require('path');

const W = 1080;
const H = 1920;

// ---------- 분야 템플릿 (스토리보드에 값이 없을 때의 기본값) ----------
const TEMPLATES = {
  salim: { label: '살림템 후기', look: 'bright', textStyle: 'outline', textAnim: 'fade', hookStyle: 'yellow', guide: 'data/reels-guide.md' },
  info: { label: '정보 릴스', look: 'vivid', textStyle: 'bigbold', textAnim: 'words', hookStyle: 'block', guide: 'data/reels-templates/info.md' },
  sermon: { label: '설교·말씀 릴스', look: 'moody', textStyle: 'serif', textAnim: 'fade', hookStyle: 'serif', cardBackground: '#14110F', guide: 'data/reels-templates/sermon.md' },
  basic: { label: '기본', look: 'none', textStyle: 'outline', textAnim: 'none', hookStyle: 'yellow', guide: 'data/reels-guide.md' },
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
};

const TEXT_STYLES = {
  outline: '굵은 외곽선',
  box: '반투명 박스',
  marker: '형광펜 강조',
  serif: '명조 감성',
  bigbold: '대형 타이포',
  minimal: '미니멀',
};
const TEXT_ANIMS = { none: '효과 없음', fade: '스르륵 나타남', slide: '아래서 올라옴', words: '한 단어씩' };
const HOOK_STYLES = { yellow: '노란 박스', serif: '명조 + 금색 선', block: '흰 블록 대형' };

function resolveStyle(sb, cut = {}) {
  const t = TEMPLATES[sb.template] || TEMPLATES.salim;
  return {
    template: TEMPLATES[sb.template] ? sb.template : 'salim',
    look: cut.look || sb.look || t.look,
    textStyle: cut.textStyle || sb.textStyle || t.textStyle,
    textAnim: cut.textAnim || sb.textAnim || t.textAnim,
    hookStyle: sb.hookStyle || t.hookStyle,
    cardBackground: t.cardBackground || '#111111',
  };
}

function lookChain(name, inL, outL, prefix) {
  return (LOOKS[name] || LOOKS.none).chain(inL, outL, prefix);
}

// ---------- 타이포그래피 ----------
const SANS =
  "'ReelsCustom','Pretendard','Apple SD Gothic Neo','AppleSDGothicNeo','Malgun Gothic','맑은 고딕','NanumSquareRound','NanumGothic','Noto Sans CJK KR','Noto Sans KR',sans-serif";
const SERIF =
  "'ReelsSerif','Nanum Myeongjo','NanumMyeongjo','나눔명조','AppleMyungjo','Apple Myungjo','Batang','바탕','Noto Serif KR','Noto Serif CJK KR',serif";

// assets/fonts/ : 파일명에 serif·myeongjo·명조가 들어가면 명조 자리, 나머지 첫 파일은 고딕 자리
function customFontCss(root) {
  const dir = path.join(root, 'assets', 'fonts');
  if (!fs.existsSync(dir)) return '';
  const files = fs.readdirSync(dir).filter((n) => /\.(ttf|otf|woff2?)$/i.test(n));
  const face = (family, f) => {
    const ext = path.extname(f).toLowerCase();
    const fmt = { '.ttf': 'truetype', '.otf': 'opentype', '.woff': 'woff', '.woff2': 'woff2' }[ext];
    const data = fs.readFileSync(path.join(dir, f)).toString('base64');
    return `@font-face{font-family:'${family}';src:url(data:font/${fmt};base64,${data}) format('${fmt}');}`;
  };
  const serif = files.find((n) => /serif|myeongjo|myungjo|명조/i.test(n));
  const sans = files.find((n) => n !== serif);
  return (sans ? face('ReelsCustom', sans) : '') + (serif ? face('ReelsSerif', serif) : '');
}

const ring = (r, color = '#000') =>
  Array.from({ length: 16 }, (_, i) => {
    const a = (i / 16) * Math.PI * 2;
    return `${(Math.cos(a) * r).toFixed(1)}px ${(Math.sin(a) * r).toFixed(1)}px 0 ${color}`;
  }).join(',');

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

// "*강조*" 표시를 단어 토큰으로: [[{w, em}], ...] (줄 단위)
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
  if (item.kind === 'hook') return { yellow: 86, serif: 82, block: 94 }[item.hookStyle] || 86;
  const sub = { outline: 66, box: 58, marker: 64, serif: 62, bigbold: 86, minimal: 52 }[item.style] || 66;
  return item.kind === 'card' ? Math.round(sub * 1.25) : sub;
}

function maxTextWidth(kind) {
  return { hook: W - 120, label: W - 88, title: W - 120 }[kind] || W - 140;
}

function styleCss(item) {
  const em = '#FFE14D';
  const gold = '#EBCB7E';
  const s = {
    outline: `.l{font-weight:800;color:#fff;line-height:1.25;text-shadow:${ring(7)},0 6px 18px rgba(0,0,0,.5)} .em{color:${em}}`,
    box: `.l{font-weight:700;color:#fff;line-height:1.3;background:rgba(0,0,0,.66);padding:8px 22px;border-radius:14px;margin:5px 0} .em{color:${em}}`,
    marker: `.l{font-weight:800;color:#fff;line-height:1.35;text-shadow:${ring(6)}}
      .em{color:#111;text-shadow:none;background:linear-gradient(transparent 8%,${em} 8%,${em} 92%,transparent 92%);padding:0 8px;border-radius:6px}`,
    serif: `.l{font-family:${SERIF};font-weight:700;color:#fff;line-height:1.55;letter-spacing:-0.5px;
      text-shadow:0 2px 14px rgba(0,0,0,.75),0 0 3px rgba(0,0,0,.6)} .em{color:${gold}}`,
    bigbold: `.l{font-weight:900;color:#fff;line-height:1.15;letter-spacing:-1.5px;text-shadow:${ring(8)},0 8px 22px rgba(0,0,0,.5)}
      .em{color:${em};font-size:1.12em}`,
    minimal: `.l{font-weight:600;color:#fff;line-height:1.4;text-shadow:0 3px 12px rgba(0,0,0,.85),0 0 2px rgba(0,0,0,.8)}
      .em{font-weight:900;color:${em}}`,
  };
  return s[item.style] || s.outline;
}

function hookCss(hookStyle) {
  return {
    yellow: `.l{font-weight:900;color:#111;background:#FFE14D;padding:6px 26px;margin:6px 0;border-radius:18px;line-height:1.22;box-shadow:0 8px 24px rgba(0,0,0,.3)} .em{color:#C2410C}`,
    serif: `.wrap:before,.wrap:after{content:"";display:block;width:120px;height:3px;background:#EBCB7E;margin:22px auto}
      .l{font-family:${SERIF};font-weight:800;color:#fff;line-height:1.45;text-shadow:0 3px 16px rgba(0,0,0,.8)} .em{color:#EBCB7E}`,
    block: `.l{font-weight:900;color:#111;background:#fff;padding:4px 22px;margin:0;line-height:1.18;letter-spacing:-2px;box-shadow:0 10px 30px rgba(0,0,0,.35)}
      .em{color:#E11D48}`,
  }[hookStyle] || '';
}

function layoutCss(item) {
  const top = { bigbold: 0.55 }[item.style] || 0.62;
  return {
    sub: `.wrap{position:absolute;left:70px;right:70px;top:${Math.round(H * top)}px;text-align:center}`,
    card: '.wrap{position:absolute;left:70px;right:70px;top:50%;transform:translateY(-50%);text-align:center}',
    hook: `.wrap{position:absolute;left:60px;right:60px;top:${Math.round(H * 0.155)}px;text-align:center}`,
    title: `.wrap{position:absolute;left:60px;right:60px;top:${Math.round(H * 0.1)}px;text-align:center}
      .l{font-weight:900;color:#111;background:rgba(255,255,255,.94);padding:10px 26px;border-radius:16px;line-height:1.25;box-shadow:0 6px 20px rgba(0,0,0,.25)} .em{color:#E11D48}`,
    label: `.wrap{position:absolute;left:44px;top:${Math.round(H * 0.075)}px}
      .l{font-weight:700;color:#fff;background:rgba(0,0,0,.6);padding:6px 16px;border-radius:10px;line-height:1.3}`,
  }[item.kind];
}

// item: { kind: sub|card|hook|title|label, style, hookStyle, text, ref, reveal, fontSize }
function overlayHtml(item, fontCss) {
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
  const refColor = item.style === 'serif' || item.hookStyle === 'serif' ? '#EBCB7E' : 'rgba(255,255,255,.9)';
  const ref = item.ref
    ? `<div class="ref" style="font-family:${item.style === 'serif' ? SERIF : SANS};font-size:${Math.max(30, Math.round(item.fontSize * 0.55))}px;color:${refColor};margin-top:22px;font-weight:700;text-shadow:0 2px 10px rgba(0,0,0,.8)">${esc(plain(item.ref))}</div>`
    : '';
  const typo = item.kind === 'hook' ? hookCss(item.hookStyle) : ['sub', 'card'].includes(item.kind) ? styleCss(item) : '';
  return `<!doctype html><html><head><meta charset="utf-8"><style>${fontCss}
    html,body{margin:0;width:${W}px;height:${H}px;background:transparent;overflow:hidden}
    body{font-family:${SANS}} *{word-break:keep-all}
    .l{display:inline-block;font-size:var(--fs);white-space:nowrap}
    ${layoutCss(item)}
    ${typo}</style></head>
    <body><div class="wrap" style="--fs:${item.fontSize}px">${body}${ref}</div></body></html>`;
}

module.exports = {
  TEMPLATES,
  LOOKS,
  TEXT_STYLES,
  TEXT_ANIMS,
  HOOK_STYLES,
  resolveStyle,
  lookChain,
  customFontCss,
  overlayHtml,
  baseFontSize,
  maxTextWidth,
  tokenize,
  plain,
  wordCount,
};
