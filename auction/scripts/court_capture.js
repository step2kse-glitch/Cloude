// 법원경매정보(courtauction.go.kr) 순회·수집기 — 읽기 전용
// 화면을 돌아다니며 (1) 서버가 주는 JSON/PDF 응답 (2) 화면 텍스트 (3) 클릭 가능한 요소 목록 (4) 스크린샷을
// auction/raw/<시각>/ 에 그대로 저장한다. 해석·평가는 Claude가 이 파일들을 읽고 한다.
//
// 사용:
//   node auction/scripts/court_capture.js                     수동 모드: 브라우저에서 직접 검색·클릭, 전부 자동 기록
//   node auction/scripts/court_capture.js --recipe auction/data/recipes/search.json [--criteria auction/data/criteria.json]
//                                                              자동 모드: 레시피(실측 셀렉터) 대로 순회
//   옵션: --out <폴더>  --max-minutes 20  --headless  --url <시작 URL>
//
// 원칙: 로그인·입찰·신청 등 쓰기 동작 금지. 요청 사이 최소 1.5초 간격(서버 배려). 셀렉터는 추측 말고 elements.json 실측으로.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..', '..');
const START_URL = 'https://www.courtauction.go.kr/';
const MIN_GAP_MS = 1500;
const VIEWPORT = { width: 1600, height: 1000 };
// 쓰기 동작으로 보이는 버튼은 레시피에서도 클릭 거부
const FORBIDDEN_TEXT = /입찰표|전자입찰|신청하기|결제|로그인|회원가입|제출|매수신고/;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const hash = (s) => crypto.createHash('sha1').update(s).digest('hex').slice(0, 12);
const stamp = () => new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '').replace('T', '-');

function parseArgs(argv) {
  const a = { maxMinutes: 20, headless: false };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k === '--recipe') a.recipe = argv[++i];
    else if (k === '--criteria') a.criteria = argv[++i];
    else if (k === '--out') a.out = argv[++i];
    else if (k === '--url') a.url = argv[++i];
    else if (k === '--max-minutes') a.maxMinutes = Number(argv[++i]);
    else if (k === '--headless') a.headless = true;
  }
  return a;
}

class Recorder {
  constructor(dir) {
    this.dir = dir;
    this.seen = new Set();
    this.index = [];
    this.snapNo = 0;
    fs.mkdirSync(dir, { recursive: true });
  }

  save(name, data, meta) {
    fs.writeFileSync(path.join(this.dir, name), data);
    this.index.push({ file: name, at: new Date().toISOString(), ...meta });
    this.flushIndex();
  }

  flushIndex() {
    fs.writeFileSync(path.join(this.dir, 'index.json'), JSON.stringify(this.index, null, 2));
  }

  async onResponse(res) {
    try {
      const type = (res.headers()['content-type'] || '').toLowerCase();
      const url = res.url();
      if (/\.(png|jpe?g|gif|svg|css|js|woff2?|ico)(\?|$)/i.test(url)) return;
      const isPdf = type.includes('pdf');
      if (!isPdf && !/json|xml|text\/plain/.test(type) && !/\.on(\?|$)|\.laf(\?|$)/.test(url)) return;
      const body = await res.body();
      if (!body.length || body.length > 15 * 1024 * 1024) return;
      const h = hash(body);
      if (this.seen.has(h)) return;
      this.seen.add(h);
      const n = String(this.index.length).padStart(4, '0');
      if (isPdf) return this.save(`${n}-doc.pdf`, body, { kind: 'pdf', url });
      const text = body.toString('utf8');
      const trimmed = text.trim();
      if (!(trimmed.startsWith('{') || trimmed.startsWith('[') || trimmed.startsWith('<'))) return;
      const ext = trimmed.startsWith('<') ? 'xml' : 'json';
      if (ext === 'xml' && /<html/i.test(trimmed.slice(0, 300))) return; // HTML 페이지는 스냅샷이 담당
      const req = res.request();
      this.save(`${n}-resp.${ext}`, text, { kind: 'response', url, method: req.method(), postData: (req.postData() || '').slice(0, 2000) });
    } catch {
      // 리다이렉트·취소된 응답은 무시
    }
  }

  // 모든 프레임의 화면 텍스트 + 클릭 가능한 요소 목록. 바뀐 경우에만 저장.
  async snapshot(page, label = '', force = false) {
    const parts = [];
    const elements = [];
    for (const frame of page.frames()) {
      try {
        const r = await frame.evaluate(collectFrame);
        if (r.text.trim()) parts.push(`##### frame: ${frame.name() || '(main)'} ${frame.url()}\n${r.text}`);
        elements.push(...r.elements.map((e) => ({ frame: frame.name() || '(main)', ...e })));
      } catch {}
    }
    const text = parts.join('\n\n');
    const h = hash(text);
    if (!force && this.seen.has('snap:' + h)) return null;
    this.seen.add('snap:' + h);
    const n = `snap-${String(++this.snapNo).padStart(3, '0')}`;
    const header = `URL: ${page.url()}\nTITLE: ${await page.title().catch(() => '')}\nLABEL: ${label}\nAT: ${new Date().toISOString()}\n\n`;
    this.save(`${n}.txt`, header + text, { kind: 'snapshot', url: page.url(), label });
    this.save(`${n}.elements.json`, JSON.stringify(elements, null, 1), { kind: 'elements', url: page.url(), label });
    try {
      await page.screenshot({ path: path.join(this.dir, `${n}.png`), fullPage: false });
      this.index.push({ file: `${n}.png`, kind: 'screenshot', url: page.url(), label });
      this.flushIndex();
    } catch {}
    return n;
  }
}

// 브라우저 안에서 실행: 보이는 텍스트 + 상호작용 요소 (셀렉터 실측용)
function collectFrame() {
  const vis = (el) => {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none';
  };
  const text = document.body ? document.body.innerText : '';
  const els = [];
  document.querySelectorAll('input, select, textarea, button, a, [onclick], [role="button"], [role="tab"], th, td a').forEach((el, i) => {
    if (els.length > 1500 || !vis(el)) return;
    const o = { i, tag: el.tagName.toLowerCase() };
    for (const k of ['id', 'name', 'type', 'placeholder', 'title', 'value', 'href']) {
      const v = el.getAttribute(k);
      if (v) o[k] = v.slice(0, 120);
    }
    if (el.className && typeof el.className === 'string') o.class = el.className.slice(0, 120);
    const t = (el.innerText || el.textContent || '').trim().replace(/\s+/g, ' ');
    if (t) o.text = t.slice(0, 80);
    const oc = el.getAttribute('onclick');
    if (oc) o.onclick = oc.slice(0, 160);
    if (el.tagName === 'SELECT') o.options = [...el.options].slice(0, 40).map((op) => `${op.value}=${op.text.trim()}`);
    els.push(o);
  });
  return { text, elements: els };
}

// ---------- 레시피 실행 ----------
function fill(str, vars) {
  return String(str).replace(/\{\{(\w+)\}\}/g, (_, k) => (vars[k] == null ? '' : String(vars[k])));
}

async function locate(page, step, vars) {
  const frames = step.frame ? page.frames().filter((f) => f.name() === step.frame || f.url().includes(step.frame)) : page.frames();
  for (const f of frames) {
    const loc = step.selector ? f.locator(fill(step.selector, vars)) : f.getByText(fill(step.text, vars), { exact: !!step.exact });
    if (await loc.count().catch(() => 0)) return loc;
  }
  return null;
}

async function runSteps(page, steps, vars, rec, depth = 0) {
  for (const step of steps) {
    const pad = '  '.repeat(depth);
    const desc = step.note || `${step.action} ${step.selector || step.text || step.url || ''}`;
    console.log(`${pad}▶ ${desc}`);
    if (['click', 'fill', 'select', 'press', 'waitFor'].includes(step.action) && !step.selector && !step.text) {
      throw new Error(`셀렉터 없는 단계: ${desc} — elements.json 실측 후 레시피를 채울 것`);
    }
    switch (step.action) {
      case 'goto':
        await page.goto(fill(step.url, vars), { waitUntil: 'domcontentloaded' });
        break;
      case 'click': {
        const loc = await locate(page, step, vars);
        if (!loc) throw new Error(`요소 없음: ${desc}`);
        const el = loc.nth(step.nth || 0);
        const t = (await el.innerText().catch(() => '')) || '';
        if (FORBIDDEN_TEXT.test(t)) throw new Error(`쓰기 동작으로 보이는 버튼 클릭 거부: "${t.trim()}"`);
        await el.click({ timeout: 8000 });
        break;
      }
      case 'fill': {
        const loc = await locate(page, step, vars);
        if (!loc) throw new Error(`입력칸 없음: ${desc}`);
        await loc.first().fill(fill(step.value, vars));
        break;
      }
      case 'select': {
        const loc = await locate(page, step, vars);
        if (!loc) throw new Error(`선택칸 없음: ${desc}`);
        const v = fill(step.value, vars);
        if (!v) break; // 조건 비어 있으면 건너뜀
        await loc.first().selectOption(step.by === 'value' ? { value: v } : { label: v });
        break;
      }
      case 'press':
        await (await locate(page, step, vars))?.first().press(step.key || 'Enter');
        break;
      case 'wait':
        await sleep(step.ms || 2000);
        break;
      case 'waitFor': {
        const deadline = Date.now() + (step.timeout || 15000);
        while (Date.now() < deadline && !(await locate(page, step, vars))) await sleep(300);
        break;
      }
      case 'snapshot':
        await sleep(800);
        await rec.snapshot(page, fill(step.label || '', vars), true);
        break;
      case 'clickEach': {
        // 목록의 각 행(상세 링크)을 차례로 열고 then 단계 실행 후 back 단계(없으면 뒤로가기)로 복귀
        const max = Math.min(step.max || 20, 100);
        for (let i = 0; i < max; i++) {
          const loc = await locate(page, step, vars);
          const count = loc ? await loc.count() : 0;
          if (i >= count) break;
          console.log(`${pad}  [${i + 1}/${Math.min(count, max)}]`);
          await sleep(MIN_GAP_MS);
          const popupP = page.context().waitForEvent('page', { timeout: 3000 }).catch(() => null);
          await loc.nth(i).click({ timeout: 8000 });
          const popup = await popupP; // 상세가 새 창으로 열리는 경우
          const target = popup || page;
          if (popup) {
            await popup.waitForLoadState('domcontentloaded').catch(() => {});
            popup.on('response', (r) => rec.onResponse(r));
          }
          try {
            await runSteps(target, step.then || [{ action: 'wait', ms: 2500 }, { action: 'snapshot', label: `detail-${i + 1}` }], { ...vars, row: i + 1 }, rec, depth + 2);
          } catch (e) {
            console.log(`${pad}  ⚠ 상세 ${i + 1} 실패: ${e.message}`);
            await rec.snapshot(target, `detail-${i + 1}-error`, true);
          }
          if (popup) await popup.close().catch(() => {});
          else if (step.back && step.back.length) await runSteps(page, step.back, vars, rec, depth + 2);
          else await page.goBack({ waitUntil: 'domcontentloaded' }).catch(() => {});
          await sleep(MIN_GAP_MS);
        }
        break;
      }
      default:
        throw new Error(`알 수 없는 action: ${step.action}`);
    }
    await sleep(Math.max(MIN_GAP_MS, step.after || 0));
    await rec.snapshot(page, `after: ${desc}`);
  }
}

// ---------- 메인 ----------
async function main() {
  const args = parseArgs(process.argv.slice(2));
  const outDir = path.resolve(args.out || path.join(ROOT, 'auction', 'raw', stamp()));
  const rec = new Recorder(outDir);
  const vars = args.criteria ? JSON.parse(fs.readFileSync(args.criteria, 'utf8')) : {};
  const recipe = args.recipe ? JSON.parse(fs.readFileSync(args.recipe, 'utf8')) : null;

  const browser = await chromium.launch({ headless: args.headless, args: [`--window-size=${VIEWPORT.width + 40},${VIEWPORT.height + 140}`] });
  const context = await browser.newContext({ viewport: VIEWPORT, locale: 'ko-KR', acceptDownloads: true });
  const page = await context.newPage();
  page.on('response', (r) => rec.onResponse(r));
  context.on('page', (p) => p !== page && p.on('response', (r) => rec.onResponse(r)));
  page.on('download', async (d) => {
    const name = `${String(rec.index.length).padStart(4, '0')}-${d.suggestedFilename()}`;
    await d.saveAs(path.join(outDir, name)).catch(() => {});
    rec.index.push({ file: name, kind: 'download', url: d.url() });
    rec.flushIndex();
  });

  console.log(`📁 저장 위치: ${path.relative(ROOT, outDir)}`);
  let status = 'ok';
  const deadline = Date.now() + args.maxMinutes * 60000;

  try {
    await page.goto(args.url || (recipe && recipe.startUrl) || START_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await sleep(2500);
    await rec.snapshot(page, 'start', true);

    if (recipe) {
      if (!recipe.verified) console.log('⚠ 이 레시피는 아직 실측 검증 전(verified:false). 실패하면 수동 모드로 전환합니다.');
      try {
        await runSteps(page, recipe.steps || [], vars, rec);
        console.log('✅ 레시피 완료');
      } catch (e) {
        status = 'recipe-failed';
        console.log(`❌ 레시피 실패: ${e.message}`);
        await rec.snapshot(page, 'recipe-failed', true);
        if (args.headless) throw e;
        console.log('→ 수동 모드로 전환: 브라우저에서 직접 이어서 진행하세요. 화면은 계속 기록됩니다.');
        await manual(page, rec, deadline);
      }
    } else {
      await manual(page, rec, deadline);
    }
  } catch (e) {
    status = 'error';
    console.log(`❌ ${e.message}`);
    if (/ERR_|net::|Timeout/.test(e.message)) console.log('   사이트 접속 실패 — 인터넷/방화벽 또는 사이트 점검 시간인지 확인');
  } finally {
    await rec.snapshot(page, 'end').catch(() => {});
    fs.writeFileSync(path.join(outDir, 'summary.json'), JSON.stringify({ status, recipe: args.recipe || null, criteria: vars, files: rec.index.length }, null, 2));
    await browser.close().catch(() => {});
  }
  const counts = rec.index.reduce((m, x) => ((m[x.kind] = (m[x.kind] || 0) + 1), m), {});
  console.log(`\n=== 수집 결과 (${status}) ${path.relative(ROOT, outDir)}`);
  console.log(Object.entries(counts).map(([k, v]) => `${k} ${v}`).join(' · ') || '없음');
  process.exitCode = status === 'ok' ? 0 : 1;
}

// 사용자가 직접 돌아다니는 동안 3초마다 화면 변화 기록. 브라우저 창을 닫거나 터미널에서 Enter, 또는 시간 초과로 종료.
async function manual(page, rec, deadline) {
  console.log('🖱  브라우저에서 검색 조건을 넣고 목록·상세(물건상세, 매각물건명세서, 현황조사서, 감정평가서)를 차례로 열어 주세요.');
  console.log('   모든 화면과 데이터가 자동 저장됩니다. 끝나면 브라우저 창을 닫거나 터미널에서 Enter.');
  let done = false;
  page.context().on('close', () => (done = true));
  page.on('close', () => (done = true));
  if (process.stdin.isTTY) {
    process.stdin.resume();
    process.stdin.once('data', () => (done = true));
  }
  while (!done && Date.now() < deadline) {
    for (const p of page.context().pages()) await rec.snapshot(p, 'manual').catch(() => {});
    await sleep(3000);
  }
  if (process.stdin.isTTY) process.stdin.pause();
}

main();
