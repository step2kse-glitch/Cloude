// 릴스 공용 헬퍼: ffmpeg/ffprobe 경로, 미디어 정보, 작업 폴더, 자막 PNG 렌더링(크롬)
// 함정: 정적 ffmpeg 빌드 중엔 drawtext 필터가 빠진 것이 있다 → 자막은 크롬으로 투명 PNG를 만들어 overlay 한다.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const REELS_DIR = path.join(ROOT, 'drafts', 'reels');
const W = 1080;
const H = 1920;
const FPS = 30;

const IMAGE_EXT = ['.jpg', '.jpeg', '.png', '.webp'];
const VIDEO_EXT = ['.mp4', '.mov', '.m4v', '.webm', '.mkv'];
const AUDIO_EXT = ['.mp3', '.m4a', '.aac', '.wav', '.ogg'];

const ensureDir = (d) => fs.mkdirSync(d, { recursive: true });
const rel = (p) => path.relative(ROOT, p).split(path.sep).join('/');
const abs = (p) => (path.isAbsolute(p) ? p : path.join(ROOT, p));

function mediaKind(p) {
  const ext = path.extname(p).toLowerCase();
  if (IMAGE_EXT.includes(ext)) return 'image';
  if (VIDEO_EXT.includes(ext)) return 'video';
  if (AUDIO_EXT.includes(ext)) return 'audio';
  if (ext === '.heic' || ext === '.heif') return 'heic';
  return null;
}

// npm 패키지(ffmpeg-static) 우선, 없으면 PATH의 ffmpeg
function resolveBin(name) {
  const envKey = name === 'ffmpeg' ? 'FFMPEG_PATH' : 'FFPROBE_PATH';
  const candidates = [];
  if (process.env[envKey]) candidates.push(process.env[envKey]);
  try {
    candidates.push(name === 'ffmpeg' ? require('ffmpeg-static') : require('ffprobe-static').path);
  } catch {
    // 패키지 미설치
  }
  candidates.push(name);
  for (const c of candidates) {
    if (!c) continue;
    const r = spawnSync(c, ['-hide_banner', '-version'], { encoding: 'utf8' });
    if (r.status === 0) return { path: c, version: (r.stdout.split('\n')[0] || '').replace(/ Copyright.*/, '') };
  }
  return null;
}

let _bins = null;
function bins() {
  if (!_bins) _bins = { ffmpeg: resolveBin('ffmpeg'), ffprobe: resolveBin('ffprobe') };
  return _bins;
}

function requireBins() {
  const b = bins();
  if (!b.ffmpeg || !b.ffprobe) {
    throw new Error('ffmpeg/ffprobe를 찾을 수 없습니다. 폴더에서 npm install 을 다시 실행하세요.');
  }
  return b;
}

// ffmpeg 실행. 실패 시 마지막 로그 30줄을 에러로.
function runFfmpeg(args, { log } = {}) {
  const { ffmpeg } = requireBins();
  return new Promise((resolve, reject) => {
    const p = spawn(ffmpeg.path, ['-hide_banner', '-y', '-loglevel', 'error', ...args], { cwd: ROOT });
    let err = '';
    p.stderr.on('data', (d) => {
      err += d.toString();
      if (log) log(d.toString());
    });
    p.on('error', reject);
    p.on('close', (code) => {
      if (code === 0) return resolve();
      reject(new Error(`ffmpeg 실패(code ${code}):\n${err.split('\n').slice(-30).join('\n')}`));
    });
  });
}

// 미디어 정보: 회전 보정된 가로·세로, 길이, 오디오 유무
function probe(file) {
  const { ffprobe } = requireBins();
  const r = spawnSync(
    ffprobe.path,
    ['-v', 'error', '-print_format', 'json', '-show_streams', '-show_format', abs(file)],
    { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 }
  );
  if (r.status !== 0) throw new Error(`ffprobe 실패: ${file}\n${r.stderr}`);
  const j = JSON.parse(r.stdout);
  const v = (j.streams || []).find((s) => s.codec_type === 'video');
  const a = (j.streams || []).find((s) => s.codec_type === 'audio');
  let width = v ? v.width : 0;
  let height = v ? v.height : 0;
  let rotation = 0;
  if (v) {
    if (v.tags && v.tags.rotate) rotation = Number(v.tags.rotate);
    for (const sd of v.side_data_list || []) if (sd.rotation !== undefined) rotation = Number(sd.rotation);
  }
  if (Math.abs(rotation) % 180 === 90) [width, height] = [height, width];
  const duration = Number((j.format && j.format.duration) || (v && v.duration) || 0);
  return { width, height, rotation, duration, hasAudio: !!a, hasVideo: !!v };
}

// 여러 시점의 프레임을 번호·시간 라벨과 함께 한 장으로 (Claude 육안 확인용)
async function contactSheet(file, times, outFile, { tileW = 240, cols = 6 } = {}) {
  const sharp = require('sharp');
  const info = probe(file);
  const tileH = Math.round((tileW * info.height) / Math.max(1, info.width));
  const tmp = `${outFile}.tmp`;
  ensureDir(tmp);
  const tiles = [];
  try {
    for (let i = 0; i < times.length; i++) {
      const t = Math.max(0, Math.min(times[i], info.duration - 0.05));
      const out = path.join(tmp, `${i}.jpg`);
      await runFfmpeg(['-ss', t.toFixed(2), '-i', abs(file), '-frames:v', '1', '-vf', `scale=${tileW}:${tileH}`, out]);
      const label = Buffer.from(
        `<svg width="${tileW}" height="34"><rect width="${tileW}" height="34" fill="black" fill-opacity="0.65"/>` +
          `<text x="8" y="24" font-size="20" font-family="sans-serif" fill="#FFE14D">#${i + 1}  ${t.toFixed(1)}s</text></svg>`
      );
      tiles.push(await sharp(out).composite([{ input: label, top: 0, left: 0 }]).toBuffer());
    }
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  const gap = 6;
  const c = Math.min(cols, tiles.length);
  const rows = Math.ceil(tiles.length / c);
  await sharp({
    create: { width: c * (tileW + gap) + gap, height: rows * (tileH + gap) + gap, channels: 3, background: '#222' },
  })
    .composite(tiles.map((b, i) => ({ input: b, left: gap + (i % c) * (tileW + gap), top: gap + Math.floor(i / c) * (tileH + gap) })))
    .jpeg({ quality: 82 })
    .toFile(outFile);
  return { ...info, tileH };
}

function freeDiskBytes(dir = ROOT) {
  try {
    const s = fs.statfsSync(dir);
    return s.bavail * s.bsize;
  } catch {
    return null;
  }
}

// ---------- 작업(job) 폴더 ----------
function jobDir(id) {
  if (!/^[\w가-힣.-]+$/.test(id)) throw new Error(`잘못된 작업 ID: ${id}`);
  return path.join(REELS_DIR, id);
}

function readJson(p, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJson(p, data) {
  ensureDir(path.dirname(p));
  const tmp = `${p}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, p);
}

function readJob(id) {
  return readJson(path.join(jobDir(id), 'job.json'));
}

function updateJob(id, patch) {
  const p = path.join(jobDir(id), 'job.json');
  const cur = readJson(p, { id, createdAt: new Date().toISOString() });
  const next = { ...cur, ...patch, updatedAt: new Date().toISOString() };
  writeJson(p, next);
  return next;
}

function newJobId(topic = '') {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
  const slug = topic
    .replace(/[^\w가-힣]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 20);
  return slug ? `${stamp}-${slug}` : stamp;
}

// ---------- 크롬으로 자막 PNG 렌더링 (타이포 스타일은 reels_style.js) ----------
// 한 줄이 화면을 넘지 않도록 글자 크기 자동 축소 (실측 기반)
async function renderOverlays(items, outDir) {
  const { chromium } = require('playwright');
  const S = require('./reels_style');
  ensureDir(outDir);
  const launchOpts = process.env.REELS_CHROMIUM ? { executablePath: process.env.REELS_CHROMIUM } : {};
  const browser = await chromium.launch(launchOpts);
  const fontCss = S.customFontCss(ROOT);
  const results = [];
  try {
    const page = await browser.newPage({ viewport: { width: W, height: H } });
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      const base = S.baseFontSize(it);
      const maxW = S.maxTextWidth(it.kind);
      // 같은 글의 단계별 등장(reveal)은 완성본과 같은 크기를 써야 글자가 흔들리지 않는다
      let fs0 = it.sameSizeAs !== undefined ? results[it.sameSizeAs].fontSize : base;
      for (let tries = 0; it.sameSizeAs === undefined && tries < 8; tries++) {
        await page.setContent(S.overlayHtml({ ...it, reveal: Infinity, fontSize: fs0 }, fontCss));
        await page.evaluate(() => document.fonts.ready);
        const widest = await page.evaluate(() =>
          Math.max(...[...document.querySelectorAll('.l,.ref')].map((e) => e.getBoundingClientRect().width))
        );
        if (widest <= maxW + 1 || fs0 <= 32) break;
        fs0 = Math.floor(fs0 * Math.min(0.95, maxW / widest));
      }
      await page.setContent(S.overlayHtml({ ...it, fontSize: fs0 }, fontCss));
      await page.evaluate(() => document.fonts.ready);
      const file = path.join(outDir, `ov-${String(i).padStart(3, '0')}.png`);
      await page.screenshot({ path: file, omitBackground: true });
      results.push({ ...it, fontSize: fs0, baseFontSize: base, png: file });
    }
  } finally {
    await browser.close();
  }
  return results;
}

async function chromiumAvailable() {
  try {
    const { chromium } = require('playwright');
    const launchOpts = process.env.REELS_CHROMIUM ? { executablePath: process.env.REELS_CHROMIUM } : {};
    const b = await chromium.launch(launchOpts);
    await b.close();
    return true;
  } catch {
    return false;
  }
}

function lanAddresses() {
  const out = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const n of list || []) if (n.family === 'IPv4' && !n.internal) out.push(n.address);
  }
  return out;
}

module.exports = {
  ROOT,
  REELS_DIR,
  W,
  H,
  FPS,
  ensureDir,
  rel,
  abs,
  mediaKind,
  bins,
  requireBins,
  runFfmpeg,
  probe,
  contactSheet,
  freeDiskBytes,
  jobDir,
  readJson,
  writeJson,
  readJob,
  updateJob,
  newJobId,
  renderOverlays,
  chromiumAvailable,
  lanAddresses,
};
