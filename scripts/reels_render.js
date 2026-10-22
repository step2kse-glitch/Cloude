// 스토리보드 JSON → 세로 릴스 mp4 (1080x1920 · 30fps) + 썸네일 + 검증 시트 + 게시 문구
// 사용법: node scripts/reels_render.js drafts/reels/<id>/storyboard.json [--fast]
// 출력(스토리보드와 같은 폴더): reel.mp4, thumb.jpg, check.jpg, captions.txt, render-report.txt
// 게시(업로드)는 하지 않는다 — 항상 사람이 확인 후 직접 올린다.
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const R = require('./lib/reels');
const S = require('./lib/reels_style');
const V = require('./lib/reels_voice');
const FC = require('./fact_check');

const { W, H, FPS, abs, rel } = R;
const args = process.argv.slice(2);
const FAST = args.includes('--fast');
const sbArg = args.find((a) => !a.startsWith('--'));

const MOTIONS = ['zoom-in', 'zoom-out', 'pan-left', 'pan-right', 'pan-up', 'pan-down', 'none'];
const FALSE_DENIAL = /(내돈내산|광고\s*아님|광고\s*아니|협찬\s*아님|협찬\s*아니)/;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const r2 = (n) => Math.round(n * 1000) / 1000;

// ---------- 검증 ----------
function validate(sb) {
  const errors = [];
  const warns = [];
  if (!Array.isArray(sb.cuts) || !sb.cuts.length) errors.push('cuts가 비어 있습니다.');
  (sb.cuts || []).forEach((c, i) => {
    const n = `컷#${i + 1}`;
    if (!['image', 'video', 'card'].includes(c.type)) errors.push(`${n}: type은 image/video/card 중 하나`);
    if (c.type === 'card' && c.image && !fs.existsSync(abs(c.image))) errors.push(`${n}: 카드 배경 사진 없음 ${c.image}`);
    if (c.look && !S.LOOKS[c.look]) errors.push(`${n}: look(필터)은 ${Object.keys(S.LOOKS).join('/')} 중 하나`);
    if (c.textStyle && !S.TEXT_STYLES[c.textStyle]) errors.push(`${n}: textStyle은 ${Object.keys(S.TEXT_STYLES).join('/')} 중 하나`);
    if (c.textAnim && !S.TEXT_ANIMS[c.textAnim]) errors.push(`${n}: textAnim은 ${Object.keys(S.TEXT_ANIMS).join('/')} 중 하나`);
    if (c.type !== 'card') {
      if (!c.path) errors.push(`${n}: path 없음`);
      else if (!fs.existsSync(abs(c.path))) errors.push(`${n}: 파일 없음 ${c.path}`);
      else if (R.mediaKind(c.path) === 'heic') errors.push(`${n}: HEIC는 지원 안 함 → 아이폰 설정 > 카메라 > 포맷 > 높은 호환성, 또는 jpg로 변환`);
    }
    if (c.type === 'image' || c.type === 'card') {
      if (!(c.duration > 0)) errors.push(`${n}: duration(초) 필요`);
      else if (c.type === 'image' && (c.duration < 1 || c.duration > 5)) warns.push(`${n}: 사진 컷 ${c.duration}초 — 권장 1.2~4초`);
    }
    if (c.motion && !MOTIONS.includes(c.motion)) errors.push(`${n}: motion은 ${MOTIONS.join('/')} 중 하나`);
    if (c.type === 'video') {
      if (c.in !== undefined && c.out !== undefined && !(c.out > c.in)) errors.push(`${n}: out은 in보다 커야 함`);
      if (c.speed && (c.speed < 0.5 || c.speed > 2)) errors.push(`${n}: speed는 0.5~2`);
      if (c.path && /input[\\/]photos[\\/](?!_mosaic)/.test(c.path)) warns.push(`${n}: 영상 경로가 photos 폴더입니다 — 확인`);
    }
    if (c.type === 'image' && c.path && /input[\\/]photos[\\/](?!_mosaic)/.test(c.path)) {
      const m = path.join(R.ROOT, 'input', 'photos', '_mosaic', path.basename(c.path));
      if (fs.existsSync(m)) warns.push(`${n}: 모자이크 처리본이 있는데 원본을 쓰고 있음 → ${rel(m)}`);
    }
    for (const t of textsOf(c)) checkText(t, `${n} 자막`, warns, c.type === 'card' ? 18 : 16, c.type === 'card' ? 4 : 2);
  });
  if (sb.hook && sb.hook.text) checkText(sb.hook.text, '후킹 제목', warns, 12);
  if (sb.titleBar && sb.titleBar.text) checkText(sb.titleBar.text, '상단 제목', warns, 18);
  if (sb.template && !S.TEMPLATES[sb.template]) errors.push(`template은 ${Object.keys(S.TEMPLATES).join('/')} 중 하나`);
  if (sb.look && !S.LOOKS[sb.look]) errors.push(`look(필터)은 ${Object.keys(S.LOOKS).join('/')} 중 하나`);
  if (sb.textStyle && !S.TEXT_STYLES[sb.textStyle]) errors.push(`textStyle은 ${Object.keys(S.TEXT_STYLES).join('/')} 중 하나`);
  if (sb.textAnim && !S.TEXT_ANIMS[sb.textAnim]) errors.push(`textAnim은 ${Object.keys(S.TEXT_ANIMS).join('/')} 중 하나`);
  if (sb.frame && !S.FRAMES[sb.frame]) errors.push(`frame은 ${Object.keys(S.FRAMES).join('/')} 중 하나`);
  if (sb.accent && !/^#[0-9a-f]{6}$/i.test(sb.accent)) errors.push('accent(강조색)는 #RRGGBB 형식');
  if (sb.voice !== false && (sb.cuts || []).some((c) => c.narration) && !V.ready()) {
    errors.push('나레이션 문장이 있는데 목소리 설정이 없어요 → 스튜디오 설정 탭에서 Fish Audio 키·목소리 ID 입력 (또는 "voice": false)');
  }
  if (sb.hookStyle && !S.HOOK_STYLES[sb.hookStyle]) errors.push(`hookStyle은 ${Object.keys(S.HOOK_STYLES).join('/')} 중 하나`);
  const stars = [sb.hook && sb.hook.text, ...(sb.cuts || []).flatMap(textsOf)].filter((t) => t && (String(t).match(/\*/g) || []).length % 2);
  for (const t of stars) warns.push(`강조 표시 *짝이 안 맞음: "${t}"`);
  if (sb.sponsored) {
    if (!sb.disclosure || !String(sb.disclosure).trim()) errors.push('협찬 영상인데 disclosure(예: "광고 · 제품 제공")가 없습니다.');
    const all = [sb.hook && sb.hook.text, ...(sb.cuts || []).flatMap(textsOf), JSON.stringify(sb.captions || {})].join('\n');
    if (FALSE_DENIAL.test(all)) errors.push('협찬 영상에 "내돈내산/광고 아님" 같은 거짓 부인 표현이 있습니다.');
  }
  if (sb.bgm && sb.bgm.path && !fs.existsSync(abs(sb.bgm.path))) errors.push(`배경음악 파일 없음: ${sb.bgm.path}`);
  return { errors, warns };
}

function textsOf(c) {
  if (Array.isArray(c.subs) && c.subs.length) return c.subs.map((s) => s.text).filter(Boolean);
  return c.text ? [c.text] : [];
}

function checkText(t, where, warns, maxLine = 16, maxLines = 2) {
  const lines = S.plain(t).split('\n');
  if (lines.length > maxLines) warns.push(`${where}: ${lines.length}줄 — ${maxLines}줄 이하 권장`);
  for (const l of lines) if ([...l].length > maxLine) warns.push(`${where}: "${l}" ${[...l].length}자 — 한 줄 ${maxLine}자 이하 권장`);
}

// ---------- 컷 길이 계산 ----------
function planCuts(sb) {
  let t = 0;
  return sb.cuts.map((c, i) => {
    let dur;
    let info = null;
    if (c.type === 'video') {
      info = R.probe(c.path);
      const inT = clamp(Number(c.in || 0), 0, info.duration);
      const outT = clamp(c.out !== undefined ? Number(c.out) : info.duration, inT + 0.1, info.duration);
      const speed = Number(c.speed || 1);
      dur = (outT - inT) / speed;
      c = { ...c, in: inT, out: outT, speed };
    } else {
      dur = Number(c.duration);
      if (c.type === 'image') info = R.probe(c.path);
      if (c.type === 'card' && c.image) info = R.probe(c.image);
    }
    dur = Math.max(1 / FPS, Math.round(dur * FPS) / FPS); // 프레임 단위로 맞춰 누적 오차 방지
    const p = { ...c, index: i, start: r2(t), dur: r2(dur), info };
    t += dur;
    return p;
  });
}

// ---------- 사진 → 작업 캔버스(2배 해상도, 모자이크 반영) ----------
async function imageCanvas(cut, outFile, { background = false } = {}) {
  const CW = W * 2;
  const CH = H * 2;
  const { data: base, info } = await sharp(abs(background ? cut.image : cut.path)).rotate().toBuffer({ resolveWithObject: true });
  if (background) {
    // 말씀 카드 배경: 꽉 채우고 크게 흐리고 어둡게 → 글자가 주인공
    await sharp(base).resize(Math.round(CW / 6), Math.round(CH / 6), { fit: 'cover' }).blur(5)
      .modulate({ brightness: 0.5 }).resize(CW, CH).png().toFile(outFile);
    return 'cover';
  }
  const comps = [];
  for (const r of cut.blur || []) {
    const pad = 0.15;
    const x0 = clamp(Math.floor((r.x - r.w * pad) * info.width), 0, info.width - 1);
    const y0 = clamp(Math.floor((r.y - r.h * pad) * info.height), 0, info.height - 1);
    const x1 = clamp(Math.ceil((r.x + r.w * (1 + pad)) * info.width), x0 + 1, info.width);
    const y1 = clamp(Math.ceil((r.y + r.h * (1 + pad)) * info.height), y0 + 1, info.height);
    const w = x1 - x0;
    const h = y1 - y0;
    const block = Math.max(12, Math.round(Math.min(info.width, info.height) / 40));
    const small = await sharp(base).extract({ left: x0, top: y0, width: w, height: h })
      .resize(Math.max(1, Math.round(w / block)), Math.max(1, Math.round(h / block)), { fit: 'fill' }).toBuffer();
    comps.push({ input: await sharp(small).resize(w, h, { fit: 'fill', kernel: 'nearest' }).toBuffer(), left: x0, top: y0 });
  }
  const clean = comps.length ? await sharp(base).composite(comps).toBuffer() : base;
  const fit = resolveFit(cut.fit, info.width, info.height);
  if (fit === 'cover') {
    await sharp(clean).resize(CW, CH, { fit: 'cover', position: cut.focus || 'attention' }).png().toFile(outFile);
  } else {
    const bg = await sharp(clean).resize(Math.round(CW / 8), Math.round(CH / 8), { fit: 'cover' })
      .blur(14).modulate({ brightness: 0.78 }).resize(CW, CH).toBuffer();
    const fg = await sharp(clean).resize(CW, CH, { fit: 'inside' }).toBuffer({ resolveWithObject: true });
    await sharp(bg).composite([{ input: fg.data, left: Math.round((CW - fg.info.width) / 2), top: Math.round((CH - fg.info.height) / 2) }])
      .png().toFile(outFile);
  }
  return fit;
}

// 세로(9:16에 가까운) 소스는 꽉 채우고, 가로·정사각은 흐린 배경 위에 전체를 보여준다
function resolveFit(fit, w, h) {
  if (fit === 'cover' || fit === 'contain') return fit;
  return h / w >= 1.5 ? 'cover' : 'contain';
}

function zoompanExpr(motion, N) {
  const p = `(on/${Math.max(1, N - 1)})`;
  const Z = 1.12;
  const cx = "x='(iw-iw/zoom)/2'";
  const cy = "y='(ih-ih/zoom)/2'";
  switch (motion) {
    case 'zoom-out':
      return `z='${Z}-${Z - 1}*${p}':${cx}:${cy}`;
    case 'pan-left':
      return `z='${Z}':x='(iw-iw/zoom)*${p}':${cy}`;
    case 'pan-right':
      return `z='${Z}':x='(iw-iw/zoom)*(1-${p})':${cy}`;
    case 'pan-up':
      return `z='${Z}':${cx}:y='(ih-ih/zoom)*${p}'`;
    case 'pan-down':
      return `z='${Z}':${cx}:y='(ih-ih/zoom)*(1-${p})'`;
    case 'none':
      return `z='1':${cx}:${cy}`;
    default:
      return `z='1+${Z - 1}*${p}':${cx}:${cy}`;
  }
}

const ENC = () => ['-c:v', 'libx264', '-preset', FAST ? 'ultrafast' : 'veryfast', '-crf', FAST ? '26' : '17', '-pix_fmt', 'yuv420p', '-r', String(FPS)];
const AENC = ['-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-ac', '2'];

async function renderSegment(cut, build, autoMotion, st) {
  const out = path.join(build, `seg-${String(cut.index).padStart(2, '0')}.mp4`);
  const N = Math.round(cut.dur * FPS);
  const silence = ['-f', 'lavfi', '-t', String(cut.dur), '-i', 'anullsrc=r=48000:cl=stereo'];

  if (cut.type === 'image') {
    const canvas = path.join(build, `canvas-${cut.index}.png`);
    const fit = await imageCanvas(cut, canvas);
    const motion = cut.motion || autoMotion;
    await R.runFfmpeg([
      '-i', canvas, ...silence,
      '-filter_complex', `[0:v]zoompan=${zoompanExpr(motion, N)}:d=${N}:s=${W}x${H}:fps=${FPS}[z];${S.lookChain(st.look, 'z', 'lk', 'L')};[lk]setsar=1,format=yuv420p[v]`,
      '-map', '[v]', '-map', '1:a', '-frames:v', String(N), '-t', String(cut.dur), ...ENC(), ...AENC, out,
    ]);
    return { out, note: `사진 ${fit === 'cover' ? '꽉채움' : '흐린배경'} · ${motion} · 필터 ${S.LOOKS[st.look].label}` };
  }

  if (cut.type === 'card' && cut.image) {
    const canvas = path.join(build, `canvas-${cut.index}.png`);
    await imageCanvas(cut, canvas, { background: true });
    await R.runFfmpeg([
      '-i', canvas, ...silence,
      '-filter_complex', `[0:v]zoompan=${zoompanExpr('zoom-in', N)}:d=${N}:s=${W}x${H}:fps=${FPS}[z];${S.lookChain(st.look, 'z', 'lk', 'L')};[lk]setsar=1,format=yuv420p[v]`,
      '-map', '[v]', '-map', '1:a', '-frames:v', String(N), '-t', String(cut.dur), ...ENC(), ...AENC, out,
    ]);
    return { out, note: `글자 카드 (사진 배경) · 필터 ${S.LOOKS[st.look].label}` };
  }

  if (cut.type === 'card') {
    const bg = /^#[0-9a-f]{6}$/i.test(cut.background || '') ? cut.background : st.cardBackground;
    await R.runFfmpeg([
      '-f', 'lavfi', '-i', `color=c=${bg}:s=${W}x${H}:r=${FPS}:d=${cut.dur}`, ...silence,
      '-map', '0:v', '-map', '1:a', '-frames:v', String(N), '-t', String(cut.dur), ...ENC(), ...AENC, out,
    ]);
    return { out, note: '글자 카드' };
  }

  // video
  const info = cut.info;
  const fit = resolveFit(cut.fit, info.width, info.height);
  const parts = [];
  let label = 'src';
  parts.push(`[0:v]setsar=1[${label}]`);
  (cut.blur || []).forEach((r, k) => {
    const pad = 0.15;
    const x0 = clamp(Math.floor((r.x - r.w * pad) * info.width), 0, info.width - 2);
    const y0 = clamp(Math.floor((r.y - r.h * pad) * info.height), 0, info.height - 2);
    const bw = clamp(Math.ceil(r.w * (1 + 2 * pad) * info.width), 2, info.width - x0);
    const bh = clamp(Math.ceil(r.h * (1 + 2 * pad) * info.height), 2, info.height - y0);
    const blk = Math.max(12, Math.round(Math.min(info.width, info.height) / 40));
    parts.push(
      `[${label}]split[b${k}a][b${k}b];[b${k}b]crop=${bw}:${bh}:${x0}:${y0},scale=${Math.max(1, Math.round(bw / blk))}:${Math.max(1, Math.round(bh / blk))},scale=${bw}:${bh}:flags=neighbor[b${k}m];[b${k}a][b${k}m]overlay=${x0}:${y0}[m${k}]`
    );
    label = `m${k}`;
  });
  if (fit === 'cover') {
    parts.push(`[${label}]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H}[fit]`);
  } else {
    parts.push(
      `[${label}]split[fa][fb];[fa]scale=${W / 8}:${H / 8}:force_original_aspect_ratio=increase,crop=${W / 8}:${H / 8},gblur=sigma=4,eq=brightness=-0.08,scale=${W}:${H}[bg];` +
        `[fb]scale=${W}:${H}:force_original_aspect_ratio=decrease[fg];[bg][fg]overlay=(W-w)/2:(H-h)/2[fit]`
    );
  }
  parts.push(S.lookChain(st.look, 'fit', 'lk', 'L'));
  parts.push(`[lk]setpts=(PTS-STARTPTS)/${cut.speed},fps=${FPS},setsar=1,format=yuv420p[v]`);
  let chain = parts.join(';');

  const useAudio = info.hasAudio && cut.audio !== false;
  const inputs = ['-ss', String(cut.in), '-t', String(cut.out - cut.in), '-i', abs(cut.path)];
  if (useAudio) {
    const vol = Number(cut.volume ?? 1);
    chain += `;[0:a]asetpts=PTS-STARTPTS,atempo=${cut.speed},volume=${vol},aresample=48000,aformat=channel_layouts=stereo,apad[a]`;
  } else {
    inputs.push(...silence);
  }
  await R.runFfmpeg([
    ...inputs, '-filter_complex', chain,
    '-map', '[v]', '-map', useAudio ? '[a]' : '1:a', '-frames:v', String(N), '-t', String(cut.dur), ...ENC(), ...AENC, out,
  ]);
  return { out, note: `영상 ${cut.in.toFixed(1)}~${cut.out.toFixed(1)}초${cut.speed !== 1 ? ` ×${cut.speed}` : ''} · ${fit === 'cover' ? '꽉채움' : '흐린배경'} · 소리 ${useAudio ? '원본' : '없음'} · 필터 ${S.LOOKS[st.look].label}`, useAudio };
}

// ---------- 자막 타임라인 ----------
// 항목: { kind: label|hook|title|sub|card, style, hookStyle, anim, text, ref, start, end, reveal?, sameSizeAs? }
function overlayItems(sb, cuts, total) {
  const g = S.resolveStyle(sb);
  const raw = [];
  if (sb.sponsored) raw.push({ kind: 'label', text: sb.disclosure, start: 0, end: total, anim: 'none' });
  const hookEnd = sb.hook && sb.hook.text ? Math.min(total, Number(sb.hook.end || 2.5)) : 0;
  if (hookEnd) {
    raw.push({ kind: 'hook', hookStyle: g.hookStyle, accent: g.accent, text: sb.hook.text, start: Number(sb.hook.start || 0), end: hookEnd, anim: g.textAnim === 'none' ? 'none' : 'slide' });
  }
  if (sb.titleBar && sb.titleBar.text) {
    const st = sb.titleBar.start !== undefined ? Number(sb.titleBar.start) : hookEnd;
    const en = sb.titleBar.end !== undefined ? Number(sb.titleBar.end) : total;
    raw.push({ kind: 'title', accent: g.accent, text: sb.titleBar.text, start: st, end: Math.min(total, en), anim: 'fade' });
  }
  for (const c of cuts) {
    const st = S.resolveStyle(sb, c);
    const kind = c.type === 'card' ? 'card' : 'sub';
    const base = { kind, style: st.textStyle, anim: st.textAnim, accent: st.accent };
    const cutEnd = c.start + c.dur;
    if (Array.isArray(c.subs) && c.subs.length) {
      for (const x of c.subs) {
        raw.push({ ...base, text: x.text, ref: x.ref, start: r2(c.start + Number(x.start || 0)), end: r2(Math.min(cutEnd, c.start + Number(x.end ?? c.dur))) });
      }
    } else if (c.text) {
      raw.push({ ...base, text: c.text, ref: c.ref, start: c.start, end: r2(cutEnd) });
    }
  }
  const items = [];
  for (const it of raw.filter((i) => String(i.text || '').trim() && i.end > i.start)) {
    const n = S.wordCount(it.text);
    // 한 단어씩: 앞부분 60% 동안 단어를 차례로 드러냄. 단어가 너무 많으면 스르륵으로 대체
    if (it.anim === 'words' && n > 1 && n <= 14) {
      const step = Math.max(0.08, Math.min(0.35, ((it.end - it.start) * 0.6) / n));
      const fullIdx = items.length + n - 1;
      for (let k = 1; k <= n; k++) {
        const s0 = r2(it.start + (k - 1) * step);
        const e0 = k === n ? it.end : r2(it.start + k * step);
        items.push({ ...it, anim: k === 1 ? 'pop' : 'none', reveal: k, start: s0, end: e0, ...(k < n ? { sameSizeAs: undefined, _full: fullIdx } : {}) });
      }
    } else {
      items.push({ ...it, anim: it.anim === 'words' ? 'fade' : it.anim });
    }
  }
  return items;
}

// ---------- 게시 문구 ----------
function captionsText(sb) {
  const cap = sb.captions || {};
  const tags = (cap.hashtags || []).map((t) => `#${String(t).replace(/^#/, '').replace(/\s+/g, '')}`).join(' ');
  let insta = String(cap.instagram || '').trim();
  const warns = [];
  if (sb.sponsored && !/(광고|협찬|제공받|원고료|유료)/.test(insta.split('\n')[0])) {
    insta = `[${sb.disclosure}]\n${insta}`;
    warns.push('인스타 문구 첫 줄에 협찬 표기를 자동으로 붙였습니다.');
  }
  let ytDesc = String(cap.youtubeDescription || '').trim();
  if (sb.sponsored && !ytDesc.includes(sb.disclosure)) ytDesc = `${sb.disclosure}\n${ytDesc}`;
  const lines = [
    '■ 인스타그램 릴스 문구',
    insta,
    '',
    tags,
    '',
    '■ 유튜브 쇼츠 제목',
    String(cap.youtubeTitle || sb.title || '').trim(),
    '',
    '■ 유튜브 쇼츠 설명',
    ytDesc,
    '',
    tags,
  ];
  if (sb.sponsored) lines.push('', '※ 협찬 영상: 인스타 "유료 광고 라벨", 유튜브 "유료 프로모션 포함" 체크를 업로드할 때 꼭 켜세요.');
  return { text: `${lines.join('\n').trim()}\n`, warns };
}

// ---------- 메인 ----------
(async () => {
  if (!sbArg) {
    console.error('사용법: node scripts/reels_render.js <storyboard.json> [--fast]');
    process.exit(1);
  }
  const sbPath = abs(sbArg);
  const outDir = path.dirname(sbPath);
  const jobId = path.dirname(outDir) === R.REELS_DIR ? path.basename(outDir) : null;
  const setJob = (patch) => jobId && R.updateJob(jobId, patch);

  const sb = JSON.parse(fs.readFileSync(sbPath, 'utf8'));
  const { errors, warns } = validate(sb);
  if (errors.length) {
    console.error('❌ 스토리보드 오류:');
    for (const e of errors) console.error(`  - ${e}`);
    setJob({ status: 'error', error: errors.join('\n') });
    process.exit(1);
  }
  setJob({ status: 'rendering', error: null, progress: '준비 중' });

  const build = path.join(outDir, '_build');
  fs.rmSync(build, { recursive: true, force: true });
  R.ensureDir(build);
  const t0 = Date.now();

  // 0) 나레이션: 컷별 음성 생성(캐시) → 사진·카드 컷은 음성 길이만큼 자동으로 늘리고, 자막이 없으면 음성 문장으로 자막을 만든다
  const narrs = [];
  let narrChars = 0;
  let narrNew = 0;
  if (sb.voice !== false && sb.cuts.some((c) => c.narration)) {
    setJob({ progress: '나레이션 목소리 만드는 중' });
    const voiceDir = path.join(outDir, 'voice');
    const override = typeof sb.voice === 'object' && sb.voice ? sb.voice : {};
    const DELAY = 0.15;
    for (let i = 0; i < sb.cuts.length; i++) {
      const c = sb.cuts[i];
      if (!c.narration || !String(c.narration).trim()) continue;
      process.stdout.write(`나레이션 ${i + 1}... `);
      const v = await V.synthesize(c.narration, voiceDir, R, override);
      console.log(`${v.duration.toFixed(1)}초${v.cached ? ' (캐시)' : ''}`);
      narrChars += v.chars;
      if (!v.cached) narrNew += v.chars;
      const need = Math.round((v.duration + DELAY + 0.35) * 10) / 10;
      if (c.type !== 'video' && !(c.duration >= need)) {
        warns.push(`컷#${i + 1}: 나레이션 ${v.duration.toFixed(1)}초에 맞춰 ${c.duration || 0}초 → ${need}초로 늘림`);
        c.duration = need;
      }
      // text가 ""(빈 문자열)이면 '자막 없음' 의도 → 자동 자막도 만들지 않는다 (후킹과 겹치는 첫 컷 등)
      const autoSubs = (c.text === undefined || c.text === null) && !(Array.isArray(c.subs) && c.subs.length) && sb.narrationSubtitles !== false;
      if (autoSubs) {
        c.subs = V.chunkSubtitles(c.narration, DELAY, v.duration);
      }
      narrs.push({ cut: i, file: v.file, duration: v.duration, delay: DELAY });
    }
  }

  const cuts = planCuts(sb);
  for (const n of narrs) {
    const c = cuts[n.cut];
    n.start = r2(c.start + n.delay);
    if (n.duration + n.delay > c.dur + 0.05) warns.push(`컷#${n.cut + 1}: 나레이션(${n.duration.toFixed(1)}초)이 영상 컷(${c.dur.toFixed(1)}초)보다 길어 다음 컷까지 이어짐 — 구간을 늘리거나 문장을 줄이세요`);
  }
  const total = r2(cuts.reduce((s, c) => s + c.dur, 0));
  if (total < 5) warns.push(`전체 ${total}초 — 너무 짧음 (권장 7~30초)`);
  if (total > 90) warns.push(`전체 ${total}초 — 길면 완주율이 떨어짐 (권장 15~60초)`);
  const target = Number(sb.targetDuration || 0);
  if (target && Math.abs(total - target) > target * 0.2) warns.push(`목표 길이 ${target}초인데 실제 ${total}초 — 컷 길이를 조정하세요`);
  if (sb.hook && Number(sb.hook.end || 2.5) > 3.5) warns.push('후킹 제목은 처음 3초 안에 끝나는 게 좋음');

  // 1) 컷별 세그먼트
  const autoMotions = ['zoom-in', 'pan-left', 'zoom-out', 'pan-right'];
  const gst = S.resolveStyle(sb);
  const notes = [];
  let anyAudio = false;
  for (const c of cuts) {
    setJob({ progress: `컷 ${c.index + 1}/${cuts.length} 만드는 중` });
    process.stdout.write(`컷 ${c.index + 1}/${cuts.length}... `);
    const r = await renderSegment(c, build, autoMotions[c.index % autoMotions.length], S.resolveStyle(sb, c));
    if (r.useAudio) anyAudio = true;
    c.seg = r.out;
    notes.push(`#${c.index + 1} ${c.start.toFixed(1)}~${(c.start + c.dur).toFixed(1)}초 ${r.note}`);
    console.log(r.note);
  }

  // 2) 이어 붙이기 (같은 규격이라 재인코딩 없이)
  const list = path.join(build, 'concat.txt');
  fs.writeFileSync(list, cuts.map((c) => `file '${path.basename(c.seg)}'`).join('\n'));
  const body = path.join(build, 'body.mp4');
  await R.runFfmpeg(['-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', body]);

  // 3) 자막 PNG (크롬 렌더링)
  setJob({ progress: '자막 만드는 중' });
  const items = overlayItems(sb, cuts, total);
  // 단어별 등장은 완성 문장과 같은 글자 크기여야 하므로 완성본을 먼저 렌더링하도록 순서를 맞춘다
  const order = items.map((it, i) => i).sort((a, b) => (items[a]._full !== undefined) - (items[b]._full !== undefined));
  const sorted = order.map((i) => items[i]);
  const posOf = new Map(order.map((orig, pos) => [orig, pos]));
  for (const it of sorted) if (it._full !== undefined) it.sameSizeAs = posOf.get(it._full);
  const ovs = await R.renderOverlays(sorted, path.join(build, 'overlays'));

  // 4) 최종 합성: 자막 overlay + 배경음악(원본 소리 있으면 자동으로 줄임) + 음량 정규화
  setJob({ progress: '최종 합성 중' });
  // 효과 없는 자막: 정지 PNG + enable 구간 / fade·slide·pop: 구간 길이만큼 반복 입력 + 알파 페이드 + 위치 이동
  const inputs = ['-i', body];
  for (const o of ovs) {
    if (o.anim === 'none') inputs.push('-i', o.png);
    else inputs.push('-loop', '1', '-framerate', String(FPS), '-t', String(r2(o.end - o.start)), '-i', o.png);
  }
  const fc = [];
  let v = '0:v';
  if (gst.frame === 'letterbox') {
    const bar = Math.round(H * 0.095);
    fc.push(`[0:v]drawbox=x=0:y=0:w=iw:h=${bar}:color=black:t=fill,drawbox=x=0:y=ih-${bar}:w=iw:h=${bar}:color=black:t=fill[lb]`);
    v = 'lb';
  }
  ovs.forEach((o, i) => {
    const nv = `v${i}`;
    if (o.anim === 'none') {
      fc.push(`[${v}][${i + 1}:v]overlay=0:0:enable='between(t,${o.start},${Math.max(o.start, o.end - 0.001)})'[${nv}]`);
    } else {
      const d = r2(o.end - o.start);
      const fin = Math.min(o.anim === 'pop' ? 0.12 : 0.28, d / 3);
      const fout = o.anim === 'pop' ? 0 : Math.min(0.15, d / 4);
      let f = `[${i + 1}:v]format=rgba,fade=t=in:st=0:d=${fin}:alpha=1`;
      if (fout > 0) f += `,fade=t=out:st=${r2(d - fout)}:d=${fout}:alpha=1`;
      f += `,setpts=PTS-STARTPTS+${o.start}/TB[o${i}]`;
      fc.push(f);
      const y = o.anim === 'slide' ? `'if(lt(t-${o.start},0.3),40*(1-(t-${o.start})/0.3),0)'` : '0';
      fc.push(`[${v}][o${i}]overlay=x=0:y=${y}:eof_action=pass:eval=frame[${nv}]`);
    }
    v = nv;
  });
  const fadeOut = Math.max(0, total - 0.35);
  fc.push(`[${v}]fade=t=out:st=${fadeOut}:d=0.35,format=yuv420p[vout]`);

  // 목소리 트랙 = 원본 소리 + 나레이션(각 컷 시작 시점으로 지연)
  let nextIn = ovs.length + 1;
  let voice = '0:a';
  if (narrs.length) {
    const labels = [];
    for (const n of narrs) {
      inputs.push('-i', n.file);
      const ms = Math.round(n.start * 1000);
      fc.push(`[${nextIn}:a]aresample=48000,aformat=channel_layouts=stereo,adelay=${ms}|${ms},volume=${Number(sb.narrationVolume ?? 1.0)}[n${nextIn}]`);
      labels.push(`[n${nextIn}]`);
      nextIn++;
    }
    fc.push(`[0:a]${labels.join('')}amix=inputs=${labels.length + 1}:duration=first:normalize=0[vox]`);
    voice = 'vox';
    anyAudio = true;
  }

  // 배경음악: 짧은 곡은 이음새 없이 크로스페이드로 이어 붙여 30초·60초도 자연스럽게
  const bgm = sb.bgm && sb.bgm.path ? sb.bgm : null;
  let bgmNote = '없음';
  if (bgm) {
    const st = Number(bgm.start || 0);
    const bdur = R.probe(bgm.path).duration;
    const XF = 2;
    let bl;
    const need = total + 0.5;
    if (bdur - st >= need) {
      inputs.push('-i', abs(bgm.path));
      fc.push(`[${nextIn}:a]atrim=start=${st}:duration=${total},asetpts=PTS-STARTPTS[bsrc]`);
      bl = 'bsrc';
      bgmNote = `${path.basename(bgm.path)} (${st}초부터)`;
    } else if (bdur > XF * 3 && bdur - st > XF * 2) {
      const copies = Math.min(12, 1 + Math.ceil((need - (bdur - st)) / (bdur - XF)));
      for (let k = 0; k < copies; k++) inputs.push('-i', abs(bgm.path));
      fc.push(`[${nextIn}:a]atrim=start=${st},asetpts=PTS-STARTPTS[bc0]`);
      for (let k = 1; k < copies; k++) {
        fc.push(`[${k === 1 ? 'bc0' : `bx${k - 1}`}][${nextIn + k}:a]acrossfade=d=${XF}:c1=tri:c2=tri[bx${k}]`);
      }
      fc.push(`[bx${copies - 1}]atrim=duration=${total},asetpts=PTS-STARTPTS[bsrc]`);
      bl = 'bsrc';
      bgmNote = `${path.basename(bgm.path)} (${bdur.toFixed(0)}초 곡을 ${copies}번 크로스페이드로 이어 붙임)`;
    } else {
      inputs.push('-stream_loop', '-1', '-i', abs(bgm.path));
      fc.push(`[${nextIn}:a]atrim=start=${st}:duration=${total},asetpts=PTS-STARTPTS[bsrc]`);
      bl = 'bsrc';
      bgmNote = `${path.basename(bgm.path)} (반복)`;
    }
    const vol = Number(bgm.volume ?? (anyAudio ? 0.35 : 0.8));
    fc.push(`[${bl}]aresample=48000,aformat=channel_layouts=stereo,volume=${vol},afade=t=in:d=0.4,afade=t=out:st=${Math.max(0, total - 2)}:d=2[bgm]`);
    if (anyAudio) {
      fc.push(`[${voice}]asplit[orig][side]`);
      fc.push('[bgm][side]sidechaincompress=threshold=0.02:ratio=8:attack=15:release=400[duck]');
      fc.push('[orig][duck]amix=inputs=2:duration=first:normalize=0[mix]');
    } else {
      fc.push(`[${voice}][bgm]amix=inputs=2:duration=first:normalize=0[mix]`);
    }
  } else {
    fc.push(`[${voice}]anull[mix]`);
  }
  fc.push('[mix]loudnorm=I=-14:TP=-1.5:LRA=11,aresample=48000[aout]');

  const reel = path.join(outDir, 'reel.mp4');
  await R.runFfmpeg([
    ...inputs, '-filter_complex', fc.join(';'), '-map', '[vout]', '-map', '[aout]', '-t', String(total),
    '-c:v', 'libx264', '-preset', FAST ? 'ultrafast' : 'medium', '-crf', FAST ? '26' : '20', '-pix_fmt', 'yuv420p',
    '-profile:v', 'high', '-r', String(FPS), ...AENC, '-movflags', '+faststart', reel,
  ]);

  // 5) 자가 검증 — "만들었다"가 아니라 "제대로 됐는지 확인했다"
  setJob({ progress: '검증 중' });
  const check = [];
  const out = R.probe(reel);
  const ok = (cond, msg) => check.push(`${cond ? '✅' : '❌'} ${msg}`);
  ok(out.width === W && out.height === H, `해상도 ${out.width}x${out.height} (기대 ${W}x${H})`);
  ok(Math.abs(out.duration - total) < 0.3, `길이 ${out.duration.toFixed(2)}초 (기대 ${total.toFixed(2)}초)`);
  ok(out.hasAudio, '오디오 트랙 있음');
  if (narrs.length) ok(narrs.every((n) => n.start + n.duration <= total + 0.05), `나레이션 ${narrs.length}개가 영상 길이 안에 들어감`);
  ok(ovs.length === items.length, `자막 ${ovs.length}/${items.length}개 렌더링`);
  if (sb.sponsored) ok(ovs.some((o) => o.kind === 'label'), `협찬 표기 "${sb.disclosure}" 화면 전체 구간 표시`);

  const checkTimes = cuts.map((c) => c.start + c.dur * 0.55);
  if (sb.hook && sb.hook.text) checkTimes.unshift(Math.min(0.6, total / 2));
  await R.contactSheet(reel, checkTimes, path.join(outDir, 'check.jpg'), { tileW: 270, cols: 5 });
  const thumbT = sb.thumbnailAt !== undefined ? Number(sb.thumbnailAt) : Math.min(0.6, total / 2);
  await R.runFfmpeg(['-ss', String(thumbT), '-i', reel, '-frames:v', '1', '-q:v', '2', path.join(outDir, 'thumb.jpg')]);

  const cap = captionsText(sb);
  fs.writeFileSync(path.join(outDir, 'captions.txt'), cap.text);
  warns.push(...cap.warns);

  // 숫자 사실 점검 (자료 = job.json 메모·프로필). 경고만 — 승인은 이미 사용자가 했으므로 렌더는 막지 않는다
  const facts = FC.factCheck(sb, FC.sourcesFor(sbPath));
  const factLine = FC.report(facts);

  const failed = check.some((l) => l.startsWith('❌'));
  const shrunk = ovs.filter((o) => o.kind !== 'label' && o.sameSizeAs === undefined && o.fontSize < o.baseFontSize * 0.8);
  for (const o of shrunk) warns.push(`자막 "${o.text.replace(/\n/g, ' / ')}" 글자가 길어 ${o.fontSize}px로 줄어듦 — 문장을 줄이면 더 잘 보임`);

  const report = [
    `릴스 렌더링 결과 (${new Date().toLocaleString('ko-KR')}, ${((Date.now() - t0) / 1000).toFixed(0)}초 소요${FAST ? ', 빠른 미리보기 화질' : ''})`,
    `영상: ${rel(reel)} · ${total.toFixed(1)}초 · 컷 ${cuts.length}개 · 자막 ${items.length}개 · 배경음악 ${bgmNote}`,
    narrs.length ? `나레이션: ${narrs.length}컷 · ${narrChars}자 (새로 생성 ${narrNew}자${narrNew ? (V.loadConfig().provider === 'fish' ? ' — Fish Audio 크레딧 사용' : ' — 테스트 음성') : ', 전부 캐시'})` : '나레이션: 없음',
    `스타일: ${S.TEMPLATES[gst.template].label} · 필터 ${S.LOOKS[gst.look].label} · 자막 ${S.TEXT_STYLES[gst.textStyle]} · 효과 ${S.TEXT_ANIMS[gst.textAnim]} · 후킹 ${S.HOOK_STYLES[gst.hookStyle]}`,
    '',
    '[컷 구성]',
    ...notes,
    '',
    '[자동 검증]',
    ...check,
    '',
    '[사실 점검]',
    factLine,
    '',
    '[주의]',
    ...(warns.length ? warns.map((w) => `⚠️ ${w}`) : ['없음']),
    '',
    `[육안 확인] ${rel(path.join(outDir, 'check.jpg'))} — 자막이 잘리거나 개인정보가 보이지 않는지 확인`,
    `[게시 문구] ${rel(path.join(outDir, 'captions.txt'))}`,
    '※ 업로드는 자동으로 하지 않습니다. 영상을 직접 보고 인스타·유튜브 앱에서 올리세요.',
  ].join('\n');
  fs.writeFileSync(path.join(outDir, 'render-report.txt'), `${report}\n`);
  console.log(`\n${report}`);
  if (!FAST) fs.rmSync(build, { recursive: true, force: true });

  setJob({
    status: failed ? 'error' : 'rendered',
    progress: null,
    error: failed ? check.filter((l) => l.startsWith('❌')).join('\n') : null,
    renderedAt: new Date().toISOString(),
    duration: total,
    fast: FAST,
  });
  if (failed) process.exit(2);
})().catch((e) => {
  console.error('❌ 오류:', e.message);
  const sbPath = sbArg ? abs(sbArg) : null;
  if (sbPath && path.dirname(path.dirname(sbPath)) === R.REELS_DIR) {
    try {
      R.updateJob(path.basename(path.dirname(sbPath)), { status: 'error', progress: null, error: e.message.slice(0, 2000) });
    } catch {
      // 무시
    }
  }
  process.exit(1);
});
