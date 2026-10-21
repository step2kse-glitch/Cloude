// 릴스 나레이션(TTS): Fish Audio (사용자 본인 키) + 테스트용 mock
// 설정: data/voice.local.json (git에 안 올라감) 또는 환경변수 FISH_API_KEY / FISH_VOICE_ID
//   { "provider": "fish", "apiKey": "…", "voiceId": "목소리 모델 ID", "model": "s2-pro", "speed": 1.0, "volume": 0 }
// 같은 문장·같은 목소리는 캐시(drafts/reels/<ID>/voice/)를 재사용 → 다시 렌더링해도 요금이 또 나가지 않는다.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..', '..');
const CONFIG = path.join(ROOT, 'data', 'voice.local.json');
const FISH_URL = 'https://api.fish.audio/v1/tts';
const MODELS = { 's2-pro': 'S2 Pro (기본·표현력)', s1: 'S1 (이전 모델)' };

function loadConfig() {
  let c = {};
  try {
    c = JSON.parse(fs.readFileSync(CONFIG, 'utf8'));
  } catch {
    // 설정 없음
  }
  if (process.env.FISH_API_KEY) c = { provider: 'fish', ...c, apiKey: process.env.FISH_API_KEY };
  if (process.env.FISH_VOICE_ID) c.voiceId = process.env.FISH_VOICE_ID;
  if (process.env.REELS_TTS === 'mock') c.provider = 'mock';
  return { provider: 'fish', model: 's2-pro', speed: 1, volume: 0, ...c };
}

function saveConfig(patch) {
  const cur = (() => {
    try {
      return JSON.parse(fs.readFileSync(CONFIG, 'utf8'));
    } catch {
      return {};
    }
  })();
  const next = { ...cur, ...patch };
  fs.writeFileSync(CONFIG, JSON.stringify(next, null, 2));
  return next;
}

function ready(cfg = loadConfig()) {
  if (cfg.provider === 'mock') return true;
  return !!(cfg.apiKey && cfg.voiceId);
}

// 화면에 보이는 정보만 (키는 앞 4자리만)
function publicConfig(cfg = loadConfig()) {
  return {
    provider: cfg.provider,
    voiceId: cfg.voiceId || '',
    model: cfg.model,
    speed: cfg.speed,
    volume: cfg.volume,
    keySet: !!cfg.apiKey,
    keyHint: cfg.apiKey ? `${String(cfg.apiKey).slice(0, 4)}…` : '',
    ready: ready(cfg),
  };
}

// 읽기용 텍스트: 강조 별표 제거, 줄바꿈은 쉼표처럼
const speakable = (t) => String(t || '').replace(/\*/g, '').replace(/\s*\n\s*/g, ' ').trim();

async function fishTts(text, cfg, voiceOverride = {}) {
  const body = {
    text,
    reference_id: voiceOverride.voiceId || cfg.voiceId,
    format: 'mp3',
    mp3_bitrate: 128,
    normalize: true,
    latency: 'normal',
    prosody: { speed: Number(voiceOverride.speed ?? cfg.speed ?? 1), volume: Number(cfg.volume ?? 0) },
  };
  const r = await fetch(FISH_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${cfg.apiKey}`, 'Content-Type': 'application/json', model: cfg.model || 's2-pro' },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const msg = (await r.text().catch(() => '')).slice(0, 300);
    const hint =
      { 401: 'API 키가 틀렸어요', 402: 'Fish Audio 크레딧이 부족해요', 404: '목소리(voice) ID를 찾을 수 없어요', 429: '요청이 너무 많아요. 잠시 뒤 다시' }[r.status] || '';
    throw new Error(`Fish Audio 오류 ${r.status}${hint ? ` — ${hint}` : ''}: ${msg}`);
  }
  const buf = Buffer.from(await r.arrayBuffer());
  if (buf.length < 500) throw new Error('Fish Audio가 빈 음성을 보냈어요.');
  return buf;
}

// 테스트용: 글자 수에 비례한 길이의 부드러운 신호음 (네트워크·요금 없이 파이프라인 확인)
async function mockTts(text, file, runFfmpeg) {
  const dur = Math.max(0.8, [...text].length * 0.12 + 0.3).toFixed(2);
  await runFfmpeg(['-f', 'lavfi', '-i', `sine=f=330:d=${dur}`, '-af', 'volume=0.25,afade=t=in:d=0.05,afade=t=out:st=' + (dur - 0.1).toFixed(2) + ':d=0.1', '-c:a', 'libmp3lame', '-b:a', '128k', file]);
}

// text → { file, duration, cached, chars }
async function synthesize(text, cacheDir, { runFfmpeg, probe }, voiceOverride = {}) {
  const cfg = loadConfig();
  if (!ready(cfg)) throw new Error('나레이션 설정이 없어요. 스튜디오 설정 탭에서 Fish Audio API 키와 목소리 ID를 넣어 주세요.');
  const t = speakable(text);
  const key = crypto
    .createHash('sha1')
    .update(JSON.stringify([cfg.provider, voiceOverride.voiceId || cfg.voiceId, cfg.model, voiceOverride.speed ?? cfg.speed, cfg.volume, t]))
    .digest('hex')
    .slice(0, 16);
  fs.mkdirSync(cacheDir, { recursive: true });
  const file = path.join(cacheDir, `${cfg.provider}-${key}.mp3`);
  let cached = true;
  if (!fs.existsSync(file)) {
    cached = false;
    if (cfg.provider === 'mock') await mockTts(t, file, runFfmpeg);
    else fs.writeFileSync(file, await fishTts(t, cfg, voiceOverride));
  }
  return { file, duration: probe(file).duration, cached, chars: [...t].length, provider: cfg.provider };
}

// 나레이션 문장을 화면 자막 조각으로: 문장·쉼표 기준 → 조각당 최대 2줄×14자, 글자 수 비례로 시간 배분
function chunkSubtitles(narration, start, duration, maxLine = 14) {
  const t = String(narration || '').replace(/\s*\n\s*/g, ' ').trim();
  if (!t) return [];
  const sentences = t.split(/(?<=[.!?。…~])\s+|(?<=,)\s+/).filter(Boolean);
  const pieces = [];
  for (const s of sentences) {
    const words = s.split(' ');
    let cur = '';
    for (const w of words) {
      const next = cur ? `${cur} ${w}` : w;
      if ([...next.replace(/\*/g, '')].length > maxLine * 2 && cur) {
        pieces.push(cur);
        cur = w;
      } else cur = next;
    }
    if (cur) pieces.push(cur);
  }
  // 2줄로 나누기: 가운데에 가장 가까운 띄어쓰기
  const twoLines = (p) => {
    if ([...p.replace(/\*/g, '')].length <= maxLine) return p;
    const mid = p.length / 2;
    let best = -1;
    for (let i = 0; i < p.length; i++) {
      if (p[i] !== ' ') continue;
      // "한 / 번"처럼 한 글자 단어 바로 뒤에서는 끊지 않는다
      const prevWord = p.slice(0, i).split(' ').pop();
      if ([...prevWord].length <= 1) continue;
      if (best < 0 || Math.abs(i - mid) < Math.abs(best - mid)) best = i;
    }
    return best < 0 ? p : `${p.slice(0, best)}\n${p.slice(best + 1)}`;
  };
  const lens = pieces.map((p) => Math.max(1, [...p.replace(/[\s*]/g, '')].length));
  const totalLen = lens.reduce((a, b) => a + b, 0);
  let t0 = start;
  return pieces.map((p, i) => {
    const d = (duration * lens[i]) / totalLen;
    const piece = { text: twoLines(p), start: Math.round(t0 * 1000) / 1000, end: Math.round((t0 + d) * 1000) / 1000 };
    t0 += d;
    return piece;
  });
}

module.exports = { MODELS, loadConfig, saveConfig, publicConfig, ready, synthesize, chunkSubtitles, speakable };
