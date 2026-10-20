// 영상 미리보기 시트: Claude가 영상을 "볼" 수 있도록 일정 간격 프레임을 한 장에 모은다 (읽기 전용, 원본 보존)
// 사용법: node scripts/reels_frames.js <영상파일|폴더> [--out drafts/reels/<id>/frames] [--every 초]
// 출력: <out>/<영상이름>.sheet.jpg (칸마다 #번호 · 초 표시) + 콘솔에 길이·해상도·소리 유무
const fs = require('fs');
const path = require('path');
const { ensureDir, rel, abs, mediaKind, probe, contactSheet } = require('./lib/reels');

const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : def;
};
const target = args.find((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--')));

const MAX_FRAMES = 24;

async function sheetFor(file, outDir) {
  const info = probe(file);
  if (!info.hasVideo) throw new Error(`영상 트랙 없음: ${file}`);
  const dur = info.duration;
  const every = Number(opt('--every', 0)) || Math.max(0.5, Math.ceil((dur / MAX_FRAMES) * 2) / 2);
  const times = [];
  for (let t = Math.min(0.2, dur / 2); t < dur - 0.05 && times.length < MAX_FRAMES; t += every) times.push(t);
  const outFile = path.join(outDir, `${path.basename(file, path.extname(file))}.sheet.jpg`);
  await contactSheet(file, times, outFile);
  return { file: rel(abs(file)), sheet: rel(outFile), ...info, every, frames: times.length };
}

(async () => {
  if (!target) {
    console.error('사용법: node scripts/reels_frames.js <영상파일|폴더> [--out 폴더] [--every 초]');
    process.exit(1);
  }
  const t = abs(target);
  const files = fs.statSync(t).isDirectory()
    ? fs.readdirSync(t).filter((n) => mediaKind(n) === 'video').map((n) => path.join(t, n))
    : [t];
  if (!files.length) {
    console.log('영상 파일이 없습니다.');
    return;
  }
  const outDir = abs(opt('--out', path.join('drafts', 'reels', '_frames')));
  ensureDir(outDir);
  console.log('영상 미리보기 시트:');
  for (const f of files) {
    const r = await sheetFor(f, outDir);
    console.log(
      `- ${r.file}: ${r.duration.toFixed(1)}초, ${r.width}x${r.height}, 소리 ${r.hasAudio ? '있음' : '없음'} → ${r.sheet} (${r.frames}칸, ${r.every}초 간격)`
    );
  }
  console.log('※ 시트를 Read로 열어 장면별 시간(초)을 보고 컷의 in/out을 정하세요.');
})().catch((e) => {
  console.error('❌ 오류:', e.message);
  process.exit(1);
});
