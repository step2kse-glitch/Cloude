// 경매 분석 웹 화면 (내 컴퓨터에서만 도는 서버, 외부 라이브러리 없음)
//   node auction/src/cli.js web            → http://localhost:4747 (이 컴퓨터만)
//   node auction/src/cli.js web --lan      → 같은 와이파이의 핸드폰에서도 접속 (주소에 비밀 토큰 포함)
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { spawn, spawnSync } = require('child_process');
const { PATHS, readJson, writeJson, config, ymd } = require('./lib/util');
const store = require('./store');
const report = require('./report');
const calendar = require('./calendar');
const outcomes = require('./outcomes');
const content = require('./content');
const { affordableBid } = require('./calc');

const WEB = path.join(PATHS.auction, 'web');
const JOBS_DIR = path.join(PATHS.workspace, 'jobs');
const CONTENT_DIR = path.join(PATHS.workspace, 'content');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.md': 'text/markdown; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml' };

// 케이스 JSON 중 화면에서 고칠 수 있는 필드 (나머지는 AI가 서류에서 옮긴 사실이라 고급 편집에서만)
const EDITABLE = ['marketPrice', 'rentMarket', 'costs', 'homeFit', 'outcome', 'auctionComps', 'questions', 'summary', 'watch', 'memo', 'trend', 'buyer', 'exit', 'goal'];

// ---------- AI 작업 (claude -p, 구독 사용 · API 키 없음) ----------
const jobs = new Map();
const claudeBin = () => {
  const r = spawnSync(process.platform === 'win32' ? 'where' : 'which', ['claude'], { encoding: 'utf8' });
  return r.status === 0 ? r.stdout.split(/\r?\n/)[0].trim() : null;
};
const ALLOWED = ['Read', 'Write', 'Edit', 'Glob', 'Grep', 'WebSearch', 'Bash(node auction/src/*)', 'Bash(npm install)', 'Bash(npx playwright install chromium)'];
const NONINTERACTIVE = '\n\n[비대화형 실행] 사용자에게 질문할 수 없다. auction/config/criteria.json 값으로 진행하고, 모르는 사실은 지어내지 말고 케이스 questions 에 기록한 뒤 끝에 무엇이 남았는지 요약하라.';

function jobPrompt(kind, p) {
  switch (kind) {
    case 'search':
      return `/auction ${p.text || ''}${NONINTERACTIVE}`;
    case 'analyze':
      return `/auction ${p.caseNo}${NONINTERACTIVE}`;
    case 'update':
      return `/auction ${p.caseNo ? p.caseNo + ' ' : ''}임장 결과: ${p.text || ''}${NONINTERACTIVE}`;
    case 'verify':
      return `/auction 교차검증 ${p.caseNo}${NONINTERACTIVE}`;
    case 'content':
      return `/auction 콘텐츠 ${p.caseNo} ${p.type || 'blog'}${NONINTERACTIVE}`;
    default:
      return null;
  }
}

function startJob(kind, params) {
  const prompt = jobPrompt(kind, params);
  if (!prompt) throw new Error('알 수 없는 작업');
  const bin = claudeBin();
  const id = `${Date.now().toString(36)}-${kind}`;
  const job = { id, kind, params, prompt, status: 'running', startedAt: new Date().toISOString(), log: '' };
  jobs.set(id, job);
  fs.mkdirSync(JOBS_DIR, { recursive: true });
  const logFile = path.join(JOBS_DIR, `${id}.log`);
  if ([...jobs.values()].filter((j) => j.status === 'running').length > 1) {
    job.status = 'failed';
    job.log = '다른 AI 작업이 진행 중이에요. 끝난 뒤 다시 눌러 주세요.';
    return job;
  }
  if (!bin) {
    job.status = 'manual';
    job.log = 'Claude Code(claude 명령)를 찾지 못했어요. 터미널에서 Claude Code를 켜고 아래 문장을 붙여넣어 주세요:\n\n' + prompt.replace(NONINTERACTIVE, '');
    return job;
  }
  const child = spawn(bin, ['-p', prompt, '--permission-mode', 'acceptEdits', '--allowedTools', ...ALLOWED], { cwd: PATHS.root, shell: process.platform === 'win32', env: process.env });
  const append = (d) => {
    job.log += d.toString();
    fs.appendFileSync(logFile, d);
  };
  child.stdout.on('data', append);
  child.stderr.on('data', append);
  child.on('error', (e) => {
    job.status = 'failed';
    append(`\n실행 오류: ${e.message}`);
  });
  child.on('close', (code) => {
    job.status = code === 0 ? 'done' : 'failed';
    job.endedAt = new Date().toISOString();
    try {
      store.evaluateAll();
    } catch (e) {
      append(`\n재평가 오류: ${e.message}`);
    }
  });
  return job;
}

// ---------- 화면용 데이터 ----------
function summary(c) {
  const r = c.result || {};
  const k = r.calc || {};
  const best = ((r.strategy || {}).options || []).find((o) => o.key === (r.strategy || {}).best);
  const d = c.saleDate ? Math.ceil((new Date(c.saleDate) - new Date(ymd(new Date()))) / 86400000) : null;
  return {
    id: c._id,
    caseNo: c.caseNo,
    court: c.court,
    address: c.address,
    usage: c.usage,
    areaM2: c.areaM2,
    appraisal: c.appraisal,
    minPrice: c.minPrice,
    minPriceRatio: k.minPriceRatio ?? (c.appraisal ? c.minPrice / c.appraisal : null),
    failCount: c.failCount,
    saleDate: c.saleDate,
    dday: d,
    grade: r.grade || '보류',
    reasons: r.reasons || [],
    tags: r.tags || [],
    rightsLabel: r.analysis ? require('./rights-view').label(c, r.analysis) : null,
    recommended: r.grade === 'X' ? null : k.bids && k.bids.recommended,
    ceiling: r.grade === 'X' ? null : k.bids && k.bids.ceiling,
    cashNeeded: k.scenarios && k.scenarios.mid.cashNeeded,
    profit: k.scenarios && k.scenarios.mid.profit,
    best: best ? best.name : null,
    chance: r.competition && r.competition.chance,
    verified: r.verification ? r.verification.ok : null,
    watch: !!c.watch,
    sample: !!c._sample,
    outcome: c.outcome || null,
  };
}

function state() {
  const criteria = config('criteria.json');
  const costs = config('costs.json');
  const cases = store.list();
  const budget = criteria.cashAvailable ? affordableBid(criteria.cashAvailable, { buyer: criteria.buyer }) : null;
  return {
    today: ymd(new Date()),
    criteria,
    costs,
    budget,
    cases: cases.map(summary),
    upcoming: calendar.upcoming(cases, { days: 14 }),
    allEvents: cases.flatMap(calendar.eventsFor),
    stats: outcomes.stats(cases),
    jobs: [...jobs.values()].map(({ log, ...j }) => j).reverse().slice(0, 20),
    claude: !!claudeBin(),
    recipeVerified: !!readJson(path.join(PATHS.config, 'recipe.json')).verified,
    reports: fs.existsSync(PATHS.reports) ? fs.readdirSync(PATHS.reports).filter((f) => f.endsWith('.html')).sort().reverse().slice(0, 10) : [],
  };
}

function caseDetail(id) {
  const c = store.get(id);
  if (!c) return null;
  const sections = {};
  if (c.result) {
    const md = report.caseSection(c, c.result, '');
    for (const part of md.split(/\n(?=#### )/)) {
      const m = part.match(/^#### (.+)/);
      sections[m ? m[1].trim() : '기본'] = report.mdToFragment(part.replace(/^#### .+\n?/, ''));
    }
  }
  return { case: c, summary: summary(c), sections, events: calendar.eventsFor(c) };
}

// 깊은 병합 (배열은 통째로 교체)
function merge(a, b) {
  if (Array.isArray(b) || typeof b !== 'object' || b === null) return b;
  const out = { ...(a || {}) };
  for (const [k, v] of Object.entries(b)) out[k] = v === null ? null : merge(out[k], v);
  return out;
}

// ---------- HTTP ----------
function send(res, code, body, type = MIME['.json']) {
  res.writeHead(code, { 'content-type': type, 'cache-control': 'no-store' });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let d = '';
    req.on('data', (x) => {
      d += x;
      if (d.length > 2e6) reject(new Error('too large'));
    });
    req.on('end', () => {
      try {
        resolve(d ? JSON.parse(d) : {});
      } catch (e) {
        reject(e);
      }
    });
  });
}

function serveFile(res, file) {
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) return send(res, 404, { error: '없음' });
  send(res, 200, fs.readFileSync(file), MIME[path.extname(file)] || 'application/octet-stream');
}

function safeJoin(base, rel) {
  const p = path.resolve(base, decodeURIComponent(rel));
  return p.startsWith(base + path.sep) || p === base ? p : null;
}

async function route(req, res, url) {
  const p = url.pathname;
  const m = (re) => p.match(re);
  let x;

  if (req.method === 'GET' && p === '/api/state') return send(res, 200, state());
  if (req.method === 'GET' && (x = m(/^\/api\/case\/([^/]+)$/))) {
    const d = caseDetail(decodeURIComponent(x[1]));
    return d ? send(res, 200, d) : send(res, 404, { error: '물건 없음' });
  }
  if (req.method === 'POST' && p === '/api/case') {
    const b = await readBody(req);
    if (!b.caseNo) return send(res, 400, { error: '사건번호를 입력해 주세요' });
    const id = store.idOf(b.caseNo);
    if (store.get(id)) return send(res, 409, { error: '이미 있는 사건번호예요', id });
    store.save({ caseNo: b.caseNo, court: b.court || null, address: b.address || null, watch: true, registry: [], tenants: [], questions: ['서류 정리 전 — AI 분석을 실행하세요'] });
    store.evaluateAll();
    return send(res, 200, { id });
  }
  if (req.method === 'POST' && (x = m(/^\/api\/case\/([^/]+)\/(update|watch|outcome|raw)$/))) {
    const id = decodeURIComponent(x[1]);
    const c = store.get(id);
    if (!c) return send(res, 404, { error: '물건 없음' });
    const b = await readBody(req);
    let next;
    if (x[2] === 'watch') next = { ...c, watch: !c.watch };
    else if (x[2] === 'outcome') next = { ...c, outcome: b.outcome && b.outcome.result ? b.outcome : null };
    else if (x[2] === 'raw') {
      if (!b.case || !b.case.caseNo) return send(res, 400, { error: 'caseNo 가 필요해요' });
      next = { ...b.case, _id: id };
    } else {
      const patch = {};
      for (const k of EDITABLE) if (k in b) patch[k] = b[k];
      next = merge(c, patch);
    }
    delete next.result;
    store.save({ ...next, _id: id });
    store.evaluateAll();
    return send(res, 200, caseDetail(id));
  }
  if (req.method === 'DELETE' && (x = m(/^\/api\/case\/([^/]+)$/))) {
    store.remove(decodeURIComponent(x[1]));
    return send(res, 200, { ok: true });
  }
  if (req.method === 'POST' && p === '/api/settings') {
    const b = await readBody(req);
    if (b.criteria) writeJson(path.join(PATHS.config, 'criteria.json'), merge(config('criteria.json'), b.criteria));
    if (b.costs) writeJson(path.join(PATHS.config, 'costs.json'), merge(config('costs.json'), b.costs));
    store.evaluateAll();
    return send(res, 200, state());
  }
  if (req.method === 'POST' && p === '/api/samples') {
    const b = await readBody(req);
    if (b.action === 'clear') {
      for (const c of store.list()) if (c._sample) store.remove(c._id);
    } else store.loadSamples();
    store.evaluateAll();
    return send(res, 200, state());
  }
  if (req.method === 'POST' && p === '/api/report') {
    const cases = store.evaluateAll();
    if (!cases.length) return send(res, 400, { error: '물건이 없어요' });
    const r = report.writeReport(cases, config('criteria.json'), PATHS.reports);
    return send(res, 200, { url: '/reports/' + encodeURIComponent(path.basename(r.html)) });
  }
  if (req.method === 'GET' && p === '/api/calendar.ics') {
    const ics = calendar.toIcs(store.list(), { onlyWatched: url.searchParams.get('all') !== '1' });
    res.writeHead(200, { 'content-type': 'text/calendar; charset=utf-8', 'content-disposition': 'attachment; filename="auction.ics"' });
    return res.end(ics);
  }
  if (req.method === 'GET' && (x = m(/^\/api\/content\/([^/]+)$/))) {
    const c = store.get(decodeURIComponent(x[1]));
    if (!c || !c.result) return send(res, 404, { error: '분석된 물건이 아니에요' });
    const type = url.searchParams.get('type') || 'blog';
    const polished = path.join(CONTENT_DIR, `${c._id}-${type}.md`);
    const draft = content.build(c, type);
    return send(res, 200, { type, title: draft.title, text: content.toText(type, draft), polished: fs.existsSync(polished) ? fs.readFileSync(polished, 'utf8') : null });
  }
  if (req.method === 'POST' && p === '/api/jobs') {
    const b = await readBody(req);
    return send(res, 200, startJob(b.kind, b));
  }
  if (req.method === 'GET' && (x = m(/^\/api\/jobs\/([^/]+)$/))) {
    const j = jobs.get(x[1]);
    return j ? send(res, 200, j) : send(res, 404, { error: '작업 없음' });
  }
  if (req.method === 'GET' && (x = m(/^\/reports\/(.+)$/))) {
    const f = safeJoin(PATHS.reports, x[1]);
    return f ? serveFile(res, f) : send(res, 403, { error: '금지' });
  }
  if (req.method === 'GET') {
    const f = safeJoin(WEB, p === '/' ? 'index.html' : p.slice(1));
    return f ? serveFile(res, f) : send(res, 403, { error: '금지' });
  }
  send(res, 404, { error: '없음' });
}

function lanAddress() {
  for (const list of Object.values(os.networkInterfaces())) for (const a of list || []) if (a.family === 'IPv4' && !a.internal) return a.address;
  return null;
}

function start({ port = 4747, lan = false, open = true } = {}) {
  const token = lan ? crypto.randomBytes(9).toString('base64url') : null;
  store.evaluateAll();
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x');
    // 같은 와이파이 공개 모드: 토큰이 있어야 접속 (쿠키로 기억)
    if (token) {
      const cookie = (req.headers.cookie || '').includes(`t=${token}`);
      if (url.searchParams.get('t') === token) res.setHeader('set-cookie', `t=${token}; Path=/; HttpOnly; SameSite=Strict`);
      else if (!cookie) return send(res, 401, '접속 주소(토큰 포함)를 다시 확인해 주세요', 'text/plain; charset=utf-8');
    }
    try {
      await route(req, res, url);
    } catch (e) {
      send(res, 500, { error: e.message });
    }
  });
  server.listen(port, lan ? '0.0.0.0' : '127.0.0.1', () => {
    const local = `http://localhost:${port}/${token ? `?t=${token}` : ''}`;
    console.log(`\n✅ 경매 분석 화면: ${local}`);
    if (token) {
      const ip = lanAddress();
      if (ip) console.log(`📱 같은 와이파이 핸드폰: http://${ip}:${port}/?t=${token}`);
    }
    console.log('   이 창을 닫으면 화면도 꺼져요. (종료: Ctrl+C)\n');
    if (open) {
      const cmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'cmd' : 'xdg-open';
      const args = process.platform === 'win32' ? ['/c', 'start', '', local] : [local];
      try {
        const ch = spawn(cmd, args, { detached: true, stdio: 'ignore' });
        ch.on('error', () => console.log(`   브라우저를 직접 열어 주세요: ${local}`));
        ch.unref();
      } catch {}
    }
  });
  return server;
}

module.exports = { start, state, caseDetail };
