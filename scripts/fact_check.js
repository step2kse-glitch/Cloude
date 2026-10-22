// 숫자 사실 점검: 초안·스토리보드에 나온 숫자(가격·기간·개수·평점·장절 등)가 자료(메모·프로필·사용자가 준 원고)에 있는지 대조
// "자료에 없는 숫자 0개"가 통과 기준. 없는 숫자는 지어낸 것일 수 있으므로 검수 보고에 그대로 보여주고 묻는다.
// 사용법:
//   node scripts/fact_check.js drafts/20261022-슬러그.json --memo "사용자 메모"          (블로그 초안)
//   node scripts/fact_check.js drafts/reels/<ID>/storyboard.json                          (릴스: 같은 폴더 job.json 메모 자동 사용)
//   --source <파일>  자료 파일 추가 (여러 번 가능: 붙여넣은 원고, 상품 정보 등)
// 한계: "오 분", "두 번"처럼 한글로 쓴 수는 잡지 못한다.
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const abs = (p) => (path.isAbsolute(p) ? p : path.join(ROOT, p));
const read = (p) => {
  try {
    return fs.readFileSync(abs(p), 'utf8');
  } catch {
    return '';
  }
};

// 숫자 토큰: 23,900 / 4.81 / 11:28 / 16 → 비교용으로 쉼표 제거
const NUM = /\d[\d,]*(?:[.:]\d+)?/g;
const norm = (n) => n.replace(/,/g, '').replace(/\.0+$/, '');

function numbersIn(text) {
  return (String(text).match(NUM) || []).map(norm).filter((n) => n !== '');
}

// 목록 번호(줄 머리의 "1." "2)")는 사실이 아니므로 제외
function stripListMarkers(text) {
  return String(text).replace(/^\s*\d{1,2}[.)]\s/gm, ' ');
}

// 초안/스토리보드에서 "읽는 사람에게 보이는·들리는" 글만 모은다
function collectTexts(doc) {
  const out = [];
  const add = (where, t) => t && out.push({ where, text: String(t) });
  if (Array.isArray(doc.blocks)) {
    add('제목', doc.title);
    doc.blocks.forEach((b, i) => {
      add(`블록#${i + 1}`, b.text);
      add(`블록#${i + 1} 캡션`, b.caption);
    });
    (doc.tags || []).forEach((t) => add('태그', t));
  }
  if (Array.isArray(doc.cuts)) {
    add('후킹', doc.hook && doc.hook.text);
    add('상단 제목', doc.titleBar && doc.titleBar.text);
    doc.cuts.forEach((c, i) => {
      add(`컷#${i + 1} 자막`, c.text);
      (c.subs || []).forEach((s) => add(`컷#${i + 1} 자막`, s.text));
      add(`컷#${i + 1} 나레이션`, c.narration);
      add(`컷#${i + 1} 출처`, c.ref);
    });
    const cap = doc.captions || {};
    add('인스타 문구', cap.instagram);
    add('유튜브 제목', cap.youtubeTitle);
    add('유튜브 설명', cap.youtubeDescription);
    (cap.hashtags || []).forEach((t) => add('해시태그', t));
  }
  return out;
}

function factCheck(doc, sourceText) {
  const known = new Set(numbersIn(sourceText));
  const missing = [];
  let checked = 0;
  for (const { where, text } of collectTexts(doc)) {
    const clean = stripListMarkers(text.replace(/\*/g, ''));
    for (const m of clean.matchAll(NUM)) {
      const n = norm(m[0]);
      if (!n) continue;
      checked++;
      if (known.has(n)) continue;
      // 자료의 "11:28"이 본문에서 "11장 28절"이 된 경우처럼 각 부분이 자료에 있으면 통과
      if (/[.:]/.test(n) && n.split(/[.:]/).every((p) => known.has(p))) continue;
      const ctx = clean.replace(/\n/g, ' ').slice(Math.max(0, m.index - 12), m.index + m[0].length + 14).trim();
      missing.push({ where, number: m[0], context: ctx });
    }
  }
  return { checked, missing };
}

function sourcesFor(docPath, extra = [], memo = '') {
  const parts = [memo, read('data/profile.md'), read('data/blogger-profile.md'), read('data/sponsored-disclosure.md')];
  const job = path.join(path.dirname(abs(docPath)), 'job.json');
  if (fs.existsSync(job)) {
    try {
      const j = JSON.parse(fs.readFileSync(job, 'utf8'));
      parts.push(j.topic, j.memo, j.sponsorBrand, j.sponsorText);
    } catch {
      // job.json 손상 시 무시
    }
  }
  for (const s of extra) parts.push(read(s));
  return parts.filter(Boolean).join('\n');
}

function report(result) {
  const lines = [];
  if (!result.missing.length) lines.push(`✅ 사실 점검 통과: 숫자 ${result.checked}개 모두 자료에 있음 (자료에 없는 숫자 0개)`);
  else {
    lines.push(`⚠️ 자료에 없는 숫자 ${result.missing.length}개 (전체 ${result.checked}개 중) — 지어낸 숫자인지 확인 필요`);
    for (const m of result.missing) lines.push(`  - ${m.where}: "${m.number}" … ${m.context}`);
  }
  return lines.join('\n');
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const docPath = args.find((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--')));
  if (!docPath) {
    console.error('사용법: node scripts/fact_check.js <초안.json|storyboard.json> [--memo "메모"] [--source 파일 ...]');
    process.exit(1);
  }
  const extra = [];
  let memo = '';
  args.forEach((a, i) => {
    if (a === '--source') extra.push(args[i + 1]);
    if (a === '--memo') memo = args[i + 1] || '';
  });
  const doc = JSON.parse(fs.readFileSync(abs(docPath), 'utf8'));
  const r = factCheck(doc, sourcesFor(docPath, extra, memo));
  console.log(report(r));
  process.exit(r.missing.length ? 2 : 0);
}

module.exports = { factCheck, sourcesFor, report, numbersIn };
