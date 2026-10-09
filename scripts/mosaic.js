// 사진 개인정보 모자이크. 원본은 절대 덮어쓰지 않고 input/photos/_mosaic/ 에 처리본 생성.
// 사용법: node scripts/mosaic.js drafts/mosaic-YYYYMMDD.json
// spec 형식:
// { "pad": 0.15, "block": 0,
//   "items": [ { "src": "input/photos/a.jpg",
//                "regions": [ { "x": 0.1, "y": 0.2, "w": 0.15, "h": 0.2, "reason": "아이 얼굴" } ] } ] }
// 좌표: EXIF 회전 보정 후(보이는 화면 기준) 0~1 상대값. pad(기본 15%)만큼 상하좌우 여유 자동 추가.
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { ROOT, ensureDir } = require('./lib/common');

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

async function pixelate(buf, w, h, block) {
  // 함정: sharp 한 파이프라인에 resize는 1회만 적용 → 축소→버퍼→확대(nearest) 2단계로 분리
  const sw = Math.max(1, Math.round(w / block));
  const sh = Math.max(1, Math.round(h / block));
  const small = await sharp(buf).resize(sw, sh, { fit: 'fill' }).toBuffer();
  return sharp(small).resize(w, h, { fit: 'fill', kernel: 'nearest' }).toBuffer();
}

(async () => {
  const specPath = process.argv[2];
  if (!specPath) {
    console.error('사용법: node scripts/mosaic.js <spec.json>');
    process.exit(1);
  }
  const spec = JSON.parse(fs.readFileSync(path.resolve(ROOT, specPath), 'utf8'));
  const pad = spec.pad ?? 0.15;
  const outDir = path.join(ROOT, 'input', 'photos', '_mosaic');
  ensureDir(outDir);

  const report = [];
  for (const item of spec.items || []) {
    const src = path.resolve(ROOT, item.src);
    // 함정: 좌표는 EXIF 회전 보정 후 기준 → 먼저 rotate()로 방향을 확정한 버퍼를 만든다
    const { data: base, info } = await sharp(src).rotate().toBuffer({ resolveWithObject: true });
    const W = info.width;
    const H = info.height;
    const composites = [];

    for (const r of item.regions || []) {
      const px = r.w * pad;
      const py = r.h * pad;
      const x0 = clamp(Math.floor((r.x - px) * W), 0, W - 1);
      const y0 = clamp(Math.floor((r.y - py) * H), 0, H - 1);
      const x1 = clamp(Math.ceil((r.x + r.w + px) * W), x0 + 1, W);
      const y1 = clamp(Math.ceil((r.y + r.h + py) * H), y0 + 1, H);
      const w = x1 - x0;
      const h = y1 - y0;
      const block = spec.block || Math.max(12, Math.round(Math.min(W, H) / 40));
      const region = await sharp(base).extract({ left: x0, top: y0, width: w, height: h }).toBuffer();
      composites.push({ input: await pixelate(region, w, h, block), left: x0, top: y0 });
    }

    const outPath = path.join(outDir, path.basename(src));
    if (path.resolve(outPath) === path.resolve(src)) throw new Error('원본 덮어쓰기 방지: 출력 경로가 원본과 같습니다.');
    await sharp(base).composite(composites).toFile(outPath);
    report.push({ src: item.src, out: path.relative(ROOT, outPath), regions: (item.regions || []).map((r) => r.reason || '') });
  }

  console.log('모자이크 처리 결과:');
  for (const r of report) console.log(`- ${r.src} → ${r.out} (${r.regions.length}영역: ${r.regions.join(', ')})`);
  console.log('※ 처리본을 Read로 열어 실제로 가려졌는지 반드시 눈으로 확인하세요.');
})().catch((e) => {
  console.error('❌ 오류:', e.message);
  process.exit(1);
});
