// 공용 헬퍼: 브라우저 실행, 에디터 프레임, 발행 가드, 한글/이모지 입력
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..', '..');
const PROFILE_DIR = path.join(ROOT, 'naver-profile');
const WRITE_URL = 'https://blog.naver.com/GoBlogWrite.naver';
const VIEWPORT = { width: 1600, height: 1000 };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function launch() {
  const context = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: false,
    viewport: VIEWPORT,
    args: [`--window-size=${VIEWPORT.width + 40},${VIEWPORT.height + 140}`],
    locale: 'ko-KR',
  });
  const page = context.pages()[0] || (await context.newPage());
  return { context, page };
}

// 에디터는 iframe#mainFrame 안. 프레임이 없으면 페이지 자체가 에디터.
async function getEditorFrame(page) {
  const handle = await page.$('iframe#mainFrame');
  if (handle) {
    const frame = await handle.contentFrame();
    if (frame) return frame;
  }
  return page.mainFrame();
}

// 절대 규칙 2: 진짜 발행 버튼 클릭을 캡처 단계에서 원천 차단. 제거·우회 금지.
const GUARD_SCRIPT = () => {
  if (window.__publishGuardInstalled) return true;
  const SEL = 'button[data-testid="seOnePublishBtn"]';
  const block = (e) => {
    const t = e.target && e.target.closest ? e.target.closest(SEL) : null;
    if (!t) return;
    if (e.type === 'keydown' && e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    console.warn('[publish-guard] 발행 버튼 클릭 차단됨');
  };
  for (const type of ['click', 'mousedown', 'mouseup', 'pointerdown', 'pointerup', 'keydown']) {
    window.addEventListener(type, block, true);
  }
  window.__publishGuardInstalled = true;
  return true;
};

async function installPublishGuard(page) {
  const results = [];
  for (const frame of page.frames()) {
    try {
      results.push(await frame.evaluate(GUARD_SCRIPT));
    } catch {
      // 크로스 오리진 등 평가 불가 프레임은 건너뜀
    }
  }
  if (!results.some(Boolean)) throw new Error('발행 차단 가드 설치 실패 — 안전을 위해 중단합니다.');
}

async function assertGuard(page) {
  for (const frame of page.frames()) {
    try {
      const has = await frame.evaluate(
        () => !!document.querySelector('button[data-testid="seOnePublishBtn"]') && !window.__publishGuardInstalled
      );
      if (has) await frame.evaluate(GUARD_SCRIPT);
    } catch {}
  }
}

// 이모지는 별도 insertText 호출로 분리 (함께 넣으면 이모지 뒤 텍스트 유실)
const EMOJI_RE = /(\p{Extended_Pictographic}(?:️|‍\p{Extended_Pictographic}|\p{Emoji_Modifier})*)/u;
async function insertTextSafe(page, text) {
  const parts = String(text).split(EMOJI_RE).filter((p) => p !== '');
  for (const part of parts) {
    await page.keyboard.insertText(part);
    await sleep(EMOJI_RE.test(part) ? 150 : 40);
  }
}

// 여러 셀렉터 중 처음 보이는 것을 찾는다
async function firstVisible(frame, selectors, timeout = 5000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    for (const sel of selectors) {
      const loc = frame.locator(sel).first();
      try {
        if ((await loc.count()) && (await loc.isVisible())) return loc;
      } catch {}
    }
    await sleep(200);
  }
  return null;
}

// 남아있는 dim 레이어 제거 (팝업 잔류 시 이후 모든 클릭이 "intercepts pointer events"로 실패)
async function removeDim(frame) {
  return frame.evaluate(() => {
    let n = 0;
    document.querySelectorAll('.se-popup-dim, [class*="dimmed"], .se-popup-dim-white').forEach((el) => {
      el.remove();
      n++;
    });
    return n;
  });
}

const norm = (s) => String(s || '').replace(/\s+/g, '');

function draftBaseName(draftPath) {
  return path.basename(draftPath).replace(/\.json$/i, '');
}

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

module.exports = {
  ROOT,
  PROFILE_DIR,
  WRITE_URL,
  VIEWPORT,
  sleep,
  launch,
  getEditorFrame,
  installPublishGuard,
  assertGuard,
  insertTextSafe,
  firstVisible,
  removeDim,
  norm,
  draftBaseName,
  ensureDir,
};
