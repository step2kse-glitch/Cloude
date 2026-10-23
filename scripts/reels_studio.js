// 릴스 스튜디오: 내 PC에서 돌아가는 작은 웹앱. 같은 와이파이의 핸드폰 브라우저로 접속해서
// 자료 올리기 → AI 스토리보드(Claude Code 구독, API 키 없음) → 자막 수정 → 영상 만들기 → 직접 게시.
// 사용법: node scripts/reels_studio.js  (포트 변경: REELS_PORT=5000)
// 보안: 접속 키가 붙은 주소로만 열린다. 키는 drafts/reels/.studio-key (지우면 새로 발급).
// 게시(업로드)는 자동으로 하지 않는다 — 다운로드해서 사람이 직접 올린다.
const fs = require('fs');
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const { spawn, spawnSync } = require('child_process');
const R = require('./lib/reels');
const ST = require('./lib/reels_style');
const VO = require('./lib/reels_voice');
const OF = require('./lib/office');

const PORT = Number(process.env.REELS_PORT || 4321);
const UI = path.join(R.ROOT, 'studio', 'index.html');
const BGM_DIR = path.join(R.ROOT, 'input', 'bgm');
const MAX_UPLOAD = 1024 * 1024 * 1024; // 1GB
const IS_WIN = process.platform === 'win32';

R.ensureDir(R.REELS_DIR);
R.ensureDir(BGM_DIR);

const keyFile = path.join(R.REELS_DIR, '.studio-key');
if (!fs.existsSync(keyFile)) fs.writeFileSync(keyFile, crypto.randomBytes(9).toString('base64url'));
const KEY = fs.readFileSync(keyFile, 'utf8').trim();

const running = new Map(); // jobId → { kind, proc }

// ---------- 유틸 ----------
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/plain; charset=utf-8',
  '.log': 'text/plain; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.mp4': 'video/mp4',
  '.m4v': 'video/mp4',
  '.mov': 'video/quicktime',
  '.webm': 'video/webm',
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4',
  '.wav': 'audio/wav',
};

function send(res, code, body, type = 'application/json; charset=utf-8', extra = {}) {
  const data = typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body);
  res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store', ...extra });
  res.end(data);
}

const fail = (res, code, msg) => send(res, code, { error: msg });

function readBody(req, limit = 2 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let n = 0;
    req.on('data', (c) => {
      n += c.length;
      if (n > limit) {
        reject(new Error('요청이 너무 큽니다.'));
        req.destroy();
      } else chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

async function readJsonBody(req) {
  const b = await readBody(req);
  return b.length ? JSON.parse(b.toString('utf8')) : {};
}

function cookies(req) {
  const out = {};
  for (const part of (req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

function safeName(name) {
  const base = path.basename(String(name || 'file')).normalize('NFC');
  const ext = path.extname(base).toLowerCase();
  const stem = path.basename(base, path.extname(base)).replace(/[^\w가-힣.-]+/g, '_').slice(0, 60) || 'file';
  return `${stem}${ext}`;
}

function uniquePath(dir, name) {
  let p = path.join(dir, name);
  const ext = path.extname(name);
  const stem = path.basename(name, ext);
  for (let i = 2; fs.existsSync(p); i++) p = path.join(dir, `${stem}-${i}${ext}`);
  return p;
}

function tail(file, lines = 40) {
  try {
    return fs.readFileSync(file, 'utf8').split('\n').slice(-lines).join('\n');
  } catch {
    return '';
  }
}

function listJobs() {
  if (!fs.existsSync(R.REELS_DIR)) return [];
  return fs
    .readdirSync(R.REELS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !/^[._]/.test(d.name))
    .map((d) => jobSummary(d.name))
    .filter(Boolean)
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

function jobSummary(id) {
  const dir = R.jobDir(id);
  const job = R.readJob(id) || { id, createdAt: fs.statSync(dir).birthtime.toISOString() };
  const sb = R.readJson(path.join(dir, 'storyboard.json'));
  if (!job.status) job.status = fs.existsSync(path.join(dir, 'reel.mp4')) ? 'rendered' : sb ? 'storyboard' : 'uploaded';
  if (running.has(id)) job.status = running.get(id).kind === 'storyboard' ? 'storyboarding' : 'rendering';
  const has = (f) => fs.existsSync(path.join(dir, f));
  return {
    ...job,
    id,
    title: (sb && sb.title) || job.topic || id,
    hasReel: has('reel.mp4'),
    thumb: has('thumb.jpg') ? `/f/${id}/thumb.jpg` : firstImage(id),
    cutCount: sb && Array.isArray(sb.cuts) ? sb.cuts.length : 0,
  };
}

function firstImage(id) {
  const m = path.join(R.jobDir(id), 'media');
  if (!fs.existsSync(m)) return null;
  const f = fs.readdirSync(m).find((n) => R.mediaKind(n) === 'image');
  return f ? `/f/${id}/media/${encodeURIComponent(f)}` : null;
}

function mediaList(id) {
  const m = path.join(R.jobDir(id), 'media');
  if (!fs.existsSync(m)) return [];
  return fs
    .readdirSync(m)
    .filter((n) => R.mediaKind(n))
    .map((n) => ({ name: n, kind: R.mediaKind(n), path: R.rel(path.join(m, n)), url: `/f/${id}/media/${encodeURIComponent(n)}` }));
}

// 스토리보드 경로(루트 기준) → 브라우저에서 볼 수 있는 URL
function mediaUrl(p) {
  if (!p) return null;
  const a = R.abs(p);
  const relToReels = path.relative(R.REELS_DIR, a);
  if (!relToReels.startsWith('..')) return `/f/${relToReels.split(path.sep).map(encodeURIComponent).join('/')}`;
  const relToInput = path.relative(path.join(R.ROOT, 'input'), a);
  if (!relToInput.startsWith('..')) return `/input/${relToInput.split(path.sep).map(encodeURIComponent).join('/')}`;
  return null;
}

// ---------- 외부 프로세스 ----------
function claudeCli() {
  const r = spawnSync('claude', ['--version'], { encoding: 'utf8', shell: IS_WIN });
  return r.status === 0 ? r.stdout.trim() : null;
}

function startProcess(id, kind, cmd, args, logName, onDone) {
  const dir = R.jobDir(id);
  const log = fs.createWriteStream(path.join(dir, logName));
  log.write(`[${new Date().toLocaleString('ko-KR')}] ${kind} 시작\n`);
  const proc = spawn(cmd, args, { cwd: R.ROOT, shell: IS_WIN && cmd === 'claude', env: process.env, stdio: ['ignore', 'pipe', 'pipe'] });
  running.set(id, { kind, proc });
  proc.stdout.on('data', (d) => log.write(d));
  proc.stderr.on('data', (d) => log.write(d));
  proc.on('error', (e) => log.write(`\n실행 실패: ${e.message}\n`));
  proc.on('close', (code) => {
    log.end(`\n[종료 코드 ${code}]\n`);
    running.delete(id);
    onDone(code);
  });
}

function startStoryboard(id) {
  const dir = R.jobDir(id);
  const sbPath = path.join(dir, 'storyboard.json');
  const hadBefore = fs.existsSync(sbPath) ? fs.statSync(sbPath).mtimeMs : 0;
  R.updateJob(id, { status: 'storyboarding', error: null, progress: 'AI가 자료를 보고 있어요' });
  const prompt = `/reels --job ${id}`;
  const args = [
    '-p',
    IS_WIN ? `"${prompt}"` : prompt,
    '--allowedTools',
    IS_WIN ? '"Read,Write,Edit,Glob,Grep,Bash(node scripts/*)"' : 'Read,Write,Edit,Glob,Grep,Bash(node scripts/*)',
  ];
  startProcess(id, 'storyboard', 'claude', args, 'claude.log', (code) => {
    const now = fs.existsSync(sbPath) ? fs.statSync(sbPath).mtimeMs : 0;
    if (code === 0 && now > hadBefore) R.updateJob(id, { status: 'storyboard', progress: null, error: null });
    else {
      R.updateJob(id, {
        status: 'error',
        progress: null,
        error: `스토리보드를 만들지 못했어요 (종료 코드 ${code}).\n${tail(path.join(dir, 'claude.log'), 12)}`,
      });
    }
  });
}

function startRender(id, fast) {
  const sb = path.join(R.jobDir(id), 'storyboard.json');
  R.updateJob(id, { status: 'rendering', error: null, progress: '준비 중' });
  const args = [path.join(R.ROOT, 'scripts', 'reels_render.js'), sb];
  if (fast) args.push('--fast');
  startProcess(id, 'render', process.execPath, args, 'render.log', (code) => {
    const job = R.readJob(id) || {};
    if (code !== 0 && job.status !== 'error') {
      R.updateJob(id, { status: 'error', progress: null, error: tail(path.join(R.jobDir(id), 'render.log'), 15) });
    }
  });
}

// ---------- 정적 파일 (Range 지원: 핸드폰 영상 재생용) ----------
function serveFile(req, res, file, download) {
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) return fail(res, 404, '파일 없음');
  const stat = fs.statSync(file);
  const type = MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
  const headers = { 'Content-Type': type, 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-cache' };
  if (download) headers['Content-Disposition'] = `attachment; filename*=UTF-8''${encodeURIComponent(download)}`;
  const m = /bytes=(\d*)-(\d*)/.exec(req.headers.range || '');
  if (m) {
    const start = m[1] ? Number(m[1]) : Math.max(0, stat.size - Number(m[2]));
    const end = m[1] && m[2] ? Math.min(Number(m[2]), stat.size - 1) : stat.size - 1;
    if (start >= stat.size || start > end) {
      res.writeHead(416, { 'Content-Range': `bytes */${stat.size}` });
      return res.end();
    }
    res.writeHead(206, { ...headers, 'Content-Range': `bytes ${start}-${end}/${stat.size}`, 'Content-Length': end - start + 1 });
    return fs.createReadStream(file, { start, end }).pipe(res);
  }
  res.writeHead(200, { ...headers, 'Content-Length': stat.size });
  if (req.method === 'HEAD') return res.end();
  fs.createReadStream(file).pipe(res);
}

function inside(base, p) {
  const r = path.relative(base, p);
  return r && !r.startsWith('..') && !path.isAbsolute(r);
}

let chromiumOk = null;
async function status() {
  const b = R.bins();
  if (chromiumOk === null) chromiumOk = await R.chromiumAvailable();
  const customFont = (() => {
    const d = path.join(R.ROOT, 'assets', 'fonts');
    return fs.existsSync(d) ? fs.readdirSync(d).find((n) => /\.(ttf|otf|woff2?)$/i.test(n)) : null;
  })();
  const fst = ST.fontStatus(R.ROOT);
  return {
    voice: VO.publicConfig(),
    fonts: fst,
    ffmpeg: b.ffmpeg ? b.ffmpeg.version : null,
    ffprobe: b.ffprobe ? b.ffprobe.version : null,
    chromium: chromiumOk,
    claude: claudeCli(),
    font: customFont || null,
    freeBytes: R.freeDiskBytes(),
    bgmCount: fs.readdirSync(BGM_DIR).filter((n) => R.mediaKind(n) === 'audio').length,
    urls: R.lanAddresses().map((ip) => `http://${ip}:${PORT}/?key=${KEY}`),
    platform: process.platform,
  };
}

// ---------- 라우터 ----------
async function handle(req, res) {
  const url = new URL(req.url, 'http://x');
  const p = decodeURIComponent(url.pathname);

  // 인증: ?key= 로 들어오면 쿠키 심고 깨끗한 주소로
  if (url.searchParams.get('key') === KEY) {
    res.writeHead(302, { 'Set-Cookie': `rk=${KEY}; Path=/; Max-Age=31536000; SameSite=Lax; HttpOnly`, Location: '/' });
    return res.end();
  }
  if (cookies(req).rk !== KEY) {
    return send(
      res,
      401,
      '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><body style="font-family:sans-serif;padding:24px">' +
        '<h2>접속 키가 필요해요</h2><p>PC의 스튜디오 창에 표시된 주소(…?key=…)로 접속해 주세요.</p></body>',
      'text/html; charset=utf-8'
    );
  }

  if (req.method === 'GET' && (p === '/' || p === '/index.html')) return serveFile(req, res, UI);
  if (req.method === 'GET' && p === '/office.js') return serveFile(req, res, path.join(R.ROOT, 'studio', 'office.js'));

  // 작업 폴더 파일
  let m = /^\/f\/([\w가-힣.-]+)\/(.+)$/.exec(p);
  if (m && (req.method === 'GET' || req.method === 'HEAD')) {
    const dir = R.jobDir(m[1]);
    const file = path.join(dir, m[2]);
    if (!inside(dir, file)) return fail(res, 403, '금지');
    const dl = url.searchParams.get('download');
    return serveFile(req, res, file, dl ? `${m[1]}${path.extname(file)}` : null);
  }
  m = /^\/input\/(.+)$/.exec(p);
  if (m && req.method === 'GET') {
    const base = path.join(R.ROOT, 'input');
    const file = path.join(base, m[1]);
    if (!inside(base, file)) return fail(res, 403, '금지');
    return serveFile(req, res, file);
  }

  if (p === '/api/status' && req.method === 'GET') return send(res, 200, await status());
  if (p === '/api/styles' && req.method === 'GET') {
    const labels = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, typeof v === 'string' ? v : v.label]));
    return send(res, 200, {
      templates: Object.fromEntries(Object.entries(ST.TEMPLATES).map(([k, v]) => [k, { label: v.label, look: v.look, textStyle: v.textStyle, textAnim: v.textAnim, hookStyle: v.hookStyle }])),
      looks: labels(ST.LOOKS),
      textStyles: ST.TEXT_STYLES,
      textAnims: ST.TEXT_ANIMS,
      hookStyles: ST.HOOK_STYLES,
      frames: ST.FRAMES,
      templateAccents: Object.fromEntries(Object.entries(ST.TEMPLATES).map(([k, v]) => [k, v.accent])),
    });
  }
  if (p === '/api/voice' && req.method === 'GET') return send(res, 200, { ...VO.publicConfig(), models: VO.MODELS });
  if (p === '/api/voice' && req.method === 'PUT') {
    const b = await readJsonBody(req);
    const patch = {};
    if (b.provider !== undefined) patch.provider = b.provider === 'mock' ? 'mock' : 'fish';
    if (b.apiKey) patch.apiKey = String(b.apiKey).trim().slice(0, 200);
    if (b.voiceId !== undefined) patch.voiceId = String(b.voiceId).trim().slice(0, 100);
    if (b.model !== undefined && VO.MODELS[b.model]) patch.model = b.model;
    if (b.speed !== undefined) patch.speed = Math.max(0.5, Math.min(2, Number(b.speed) || 1));
    if (b.clearKey) patch.apiKey = '';
    VO.saveConfig(patch);
    return send(res, 200, VO.publicConfig());
  }
  if (p === '/api/voice/test' && req.method === 'POST') {
    const b = await readJsonBody(req);
    const text = String(b.text || '안녕하세요. 오늘도 함께해 주셔서 감사합니다.').slice(0, 120);
    const dir = R.jobDir('_voicetest');
    try {
      const v = await VO.synthesize(text, dir, R);
      return send(res, 200, { url: `/f/_voicetest/${path.basename(v.file)}`, duration: v.duration, cached: v.cached });
    } catch (e) {
      return fail(res, 400, e.message);
    }
  }
  if (p === '/api/jobs' && req.method === 'GET') return send(res, 200, listJobs());

  // ---------- AI 오피스 ----------
  if (p === '/api/office' && req.method === 'GET') return send(res, 200, OF.state(listJobs));
  if (p === '/api/office/briefing' && req.method === 'GET') return send(res, 200, { text: OF.briefing(listJobs) });
  if (p === '/api/office/tasks' && req.method === 'POST') {
    const b = await readJsonBody(req);
    if (!claudeCli()) return fail(res, 500, 'Claude Code(claude 명령)를 찾을 수 없어요. 설정 탭을 확인하세요.');
    try {
      return send(res, 200, OF.assign(String(b.employee || ''), b.instruction));
    } catch (e) {
      return fail(res, 400, e.message);
    }
  }
  {
    const om = /^\/api\/office\/tasks\/([\w-]+)\/(approve|reject|read|cancel)$/.exec(p);
    if (om && req.method === 'POST') {
      try {
        const fn = { approve: OF.approve, reject: OF.reject, read: OF.markRead, cancel: OF.cancel }[om[2]];
        return send(res, 200, fn(om[1]) || { ok: true });
      } catch (e) {
        return fail(res, 400, e.message);
      }
    }
  }

  if (p === '/api/jobs' && req.method === 'POST') {
    const b = await readJsonBody(req);
    if (!['photo', 'footage'].includes(b.mode)) return fail(res, 400, '자료 종류를 골라 주세요.');
    if (!String(b.topic || '').trim()) return fail(res, 400, '주제를 적어 주세요.');
    if (!['none', 'product', 'fee', 'product_fee', 'custom'].includes(b.sponsor)) return fail(res, 400, '협찬 여부를 골라 주세요.');
    if (!ST.TEMPLATES[b.template]) return fail(res, 400, '분야를 골라 주세요.');
    const id = R.newJobId(b.topic);
    R.ensureDir(path.join(R.jobDir(id), 'media'));
    const job = R.updateJob(id, {
      id,
      createdAt: new Date().toISOString(),
      mode: b.mode,
      topic: String(b.topic).trim().slice(0, 100),
      memo: String(b.memo || '').trim().slice(0, 2000),
      sponsor: b.sponsor,
      sponsorBrand: String(b.sponsorBrand || '').trim().slice(0, 60),
      sponsorText: String(b.sponsorText || '').trim().slice(0, 300),
      template: b.template,
      targetDuration: [15, 30, 60].includes(Number(b.targetDuration)) ? Number(b.targetDuration) : null,
      voice: !!b.voice,
      status: 'uploaded',
    });
    return send(res, 200, job);
  }

  if (p === '/api/bgm' && req.method === 'GET') {
    return send(
      res,
      200,
      fs.readdirSync(BGM_DIR).filter((n) => R.mediaKind(n) === 'audio').map((n) => ({ name: n, path: R.rel(path.join(BGM_DIR, n)), url: `/input/bgm/${encodeURIComponent(n)}` }))
    );
  }
  if (p === '/api/bgm' && req.method === 'PUT') {
    const name = safeName(url.searchParams.get('name'));
    if (R.mediaKind(name) !== 'audio') return fail(res, 400, 'mp3/m4a/wav 파일만 올릴 수 있어요.');
    return saveUpload(req, res, uniquePath(BGM_DIR, name));
  }

  m = /^\/api\/jobs\/([\w가-힣.-]+)(\/[\w-]+)?$/.exec(p);
  if (!m) return fail(res, 404, '없는 주소');
  const id = m[1];
  const action = m[2] || '';
  const dir = R.jobDir(id);
  if (!fs.existsSync(dir)) return fail(res, 404, '작업을 찾을 수 없어요.');
  const busy = running.has(id);

  if (action === '' && req.method === 'GET') {
    const sb = R.readJson(path.join(dir, 'storyboard.json'));
    if (sb && Array.isArray(sb.cuts)) for (const c of sb.cuts) c._url = mediaUrl(c.path || c.image);
    const read = (f) => (fs.existsSync(path.join(dir, f)) ? fs.readFileSync(path.join(dir, f), 'utf8') : null);
    return send(res, 200, {
      job: jobSummary(id),
      media: mediaList(id),
      storyboard: sb,
      review: read('review.md'),
      report: read('render-report.txt'),
      captions: read('captions.txt'),
      log: busy ? tail(path.join(dir, running.get(id).kind === 'storyboard' ? 'claude.log' : 'render.log'), 8) : null,
      files: {
        reel: fs.existsSync(path.join(dir, 'reel.mp4')) ? `/f/${id}/reel.mp4` : null,
        check: fs.existsSync(path.join(dir, 'check.jpg')) ? `/f/${id}/check.jpg` : null,
      },
    });
  }

  if (action === '' && req.method === 'PATCH') {
    const b = await readJsonBody(req);
    const patch = {};
    if (b.schedule !== undefined) patch.schedule = { at: String(b.schedule.at || ''), platforms: (b.schedule.platforms || []).filter((x) => ['instagram', 'youtube'].includes(x)) };
    if (b.posted !== undefined) patch.posted = { instagram: !!b.posted.instagram, youtube: !!b.posted.youtube };
    if (b.checklist !== undefined && typeof b.checklist === 'object') patch.checklist = Object.fromEntries(Object.entries(b.checklist).map(([k, v]) => [String(k).slice(0, 40), !!v]));
    return send(res, 200, R.updateJob(id, patch));
  }

  if (action === '' && req.method === 'DELETE') {
    if (busy) return fail(res, 409, '작업 중에는 지울 수 없어요.');
    if (!inside(R.REELS_DIR, dir)) return fail(res, 403, '금지');
    fs.rmSync(dir, { recursive: true, force: true });
    return send(res, 200, { ok: true });
  }

  if (action === '/media' && req.method === 'PUT') {
    if (busy) return fail(res, 409, '작업 중에는 자료를 바꿀 수 없어요.');
    const name = safeName(url.searchParams.get('name'));
    const kind = R.mediaKind(name);
    if (kind === 'heic') return fail(res, 400, 'HEIC 사진은 아직 못 써요. 아이폰 설정 > 카메라 > 포맷 > "높은 호환성"으로 찍거나 JPG로 보내 주세요.');
    if (kind !== 'image' && kind !== 'video') return fail(res, 400, `사진(jpg/png/webp)이나 영상(mp4/mov)만 올릴 수 있어요: ${name}`);
    const mdir = path.join(dir, 'media');
    R.ensureDir(mdir);
    return saveUpload(req, res, uniquePath(mdir, name));
  }

  if (action === '/storyboard' && req.method === 'POST') {
    if (busy) return fail(res, 409, '이미 작업 중이에요.');
    if (!mediaList(id).length) return fail(res, 400, '자료를 먼저 올려 주세요.');
    if (!claudeCli()) return fail(res, 500, 'Claude Code(claude 명령)를 찾을 수 없어요. 설정 탭을 확인하세요.');
    startStoryboard(id);
    return send(res, 200, { ok: true });
  }

  if (action === '/storyboard' && req.method === 'PUT') {
    if (busy) return fail(res, 409, '작업 중에는 저장할 수 없어요.');
    const sb = await readJsonBody(req);
    if (!Array.isArray(sb.cuts)) return fail(res, 400, '스토리보드 형식이 아니에요.');
    for (const c of sb.cuts) delete c._url;
    R.writeJson(path.join(dir, 'storyboard.json'), sb);
    R.updateJob(id, { status: 'storyboard', error: null });
    return send(res, 200, { ok: true });
  }

  if (action === '/render' && req.method === 'POST') {
    if (busy) return fail(res, 409, '이미 작업 중이에요.');
    if (!fs.existsSync(path.join(dir, 'storyboard.json'))) return fail(res, 400, '스토리보드가 아직 없어요.');
    const b = await readJsonBody(req);
    startRender(id, !!b.fast);
    return send(res, 200, { ok: true });
  }

  if (action === '/cancel' && req.method === 'POST') {
    const r = running.get(id);
    if (r) r.proc.kill();
    return send(res, 200, { ok: true });
  }

  return fail(res, 404, '없는 주소');
}

function saveUpload(req, res, dest) {
  const len = Number(req.headers['content-length'] || 0);
  if (len > MAX_UPLOAD) return fail(res, 413, '파일이 너무 커요 (1GB 이하).');
  const tmp = `${dest}.part`;
  const out = fs.createWriteStream(tmp);
  let n = 0;
  req.on('data', (c) => {
    n += c.length;
    if (n > MAX_UPLOAD) req.destroy();
  });
  req.pipe(out);
  out.on('finish', () => {
    if (n === 0 || n > MAX_UPLOAD) {
      fs.rmSync(tmp, { force: true });
      return fail(res, 400, '업로드 실패');
    }
    fs.renameSync(tmp, dest);
    send(res, 200, { ok: true, name: path.basename(dest), path: R.rel(dest) });
  });
  req.on('error', () => fs.rmSync(tmp, { force: true }));
}

OF.recoverInterrupted();

// 스튜디오가 꺼지면서 끊긴 작업은 '확인 필요'로 표시 (자식 프로세스도 같이 종료되므로)
for (const j of listJobs()) {
  if (j.status === 'storyboarding' || j.status === 'rendering') {
    R.updateJob(j.id, { status: 'error', progress: null, error: '작업 중에 스튜디오가 꺼졌어요. 다시 시도해 주세요.' });
  }
}

const server = http.createServer((req, res) => {
  handle(req, res).catch((e) => {
    console.error(e);
    if (!res.headersSent) fail(res, 500, e.message);
  });
});

server.listen(PORT, '0.0.0.0', async () => {
  const s = await status();
  console.log('==========================================');
  console.log(' 릴스 스튜디오가 켜졌어요 (이 창을 닫으면 꺼져요)');
  console.log('==========================================');
  console.log(`PC에서:      http://localhost:${PORT}/?key=${KEY}`);
  for (const u of s.urls) console.log(`핸드폰에서:  ${u}   (같은 와이파이)`);
  console.log('');
  console.log(`영상 합성(ffmpeg): ${s.ffmpeg ? '✅' : '❌ npm install 필요'}`);
  console.log(`자막(크롬):        ${s.chromium ? '✅' : '❌ npx playwright install chromium 필요'}`);
  console.log(`Claude Code:       ${s.claude ? `✅ ${s.claude}` : '❌ 설치·로그인 필요'}`);
  console.log('※ 게시는 자동으로 하지 않아요. 완성 영상을 받아서 직접 올리세요.');
});
