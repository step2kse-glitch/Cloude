// 매일 1건: "1억으로 경매" 블로그용 물건 고르기 → 블로그 초안. 조건 맞는 물건이 없으면 그날은 패스.
// 임시저장·발행은 하지 않는다 (승인 후 임시저장, 발행은 사람이 — 루트 CLAUDE.md 절대 규칙 2·6).
const fs = require('fs');
const path = require('path');
const { PATHS, config, ymd, toDate, readJson, writeJson } = require('./lib/util');
const store = require('./store');

const DIR = path.join(PATHS.workspace, 'daily');
const HISTORY = path.join(DIR, 'history.json');
const history = () => (fs.existsSync(HISTORY) ? readJson(HISTORY) : { blogged: [], runs: [] });
const todayFile = (d = ymd(new Date())) => path.join(DIR, `${d}.json`);

// 오늘 올릴 물건: 등급·현금·입찰일 여유·아직 안 쓴 물건 중 A 먼저, 같은 등급은 예상 이익 큰 순
function pick(cases, criteria = config('criteria.json'), h = history(), today = new Date()) {
  const D = criteria.daily || {};
  const grades = D.grades || ['A', 'B'];
  const maxCash = D.maxCashNeeded || criteria.cashAvailable;
  const minDays = D.minDaysBeforeSale ?? 7;
  const t0 = toDate(ymd(today));
  const why = {};
  const ok = cases.filter((c) => {
    const r = c.result;
    const reason =
      c._sample ? '샘플' :
      !r ? '분석 전' :
      !grades.includes(r.grade) ? `등급 ${r.grade}` :
      h.blogged.includes(c.caseNo) ? '이미 쓴 물건' :
      !c.saleDate || (toDate(c.saleDate) - t0) / 864e5 < minDays ? `입찰일까지 ${minDays}일 미만` :
      !(r.calc.scenarios && r.calc.scenarios.mid.cashNeeded <= maxCash) ? '필요 현금 초과' :
      null;
    if (reason) why[reason] = (why[reason] || 0) + 1;
    return !reason;
  });
  const G = { A: 0, B: 1 };
  ok.sort((a, b) => G[a.result.grade] - G[b.result.grade] || b.result.calc.scenarios.mid.profit - a.result.calc.scenarios.mid.profit);
  return { chosen: ok[0] || null, candidates: ok.length, skipped: why };
}

async function run({ dir = PATHS.cases, includeSamples = false } = {}) {
  const criteria = config('criteria.json');
  const h = history();
  const cases = store.evaluateAll(dir, criteria).map((c) => (includeSamples ? { ...c, _sample: false } : c));
  const p = pick(cases, criteria, h);
  const date = ymd(new Date());
  let out;
  if (!p.chosen) {
    out = { date, status: 'pass', message: '오늘은 조건에 맞는 새 물건이 없어 패스해요', checked: cases.length, skipped: p.skipped };
  } else {
    const blog = require('./blogpost');
    const episode = h.blogged.length + 1;
    const d = await blog.createDraft(p.chosen, { series: (criteria.daily || {}).series, episode });
    out = { date, status: 'ready', caseId: p.chosen._id, caseNo: p.chosen.caseNo, grade: p.chosen.result.grade, title: d.draft.title, file: d.rel, episode, candidates: p.candidates, checked: cases.length };
  }
  fs.mkdirSync(DIR, { recursive: true });
  writeJson(todayFile(date), out);
  writeJson(HISTORY, { ...h, runs: [...h.runs.slice(-60), { date, status: out.status, caseNo: out.caseNo || null }] });
  return out;
}

// 임시저장까지 끝난 뒤 호출 → 같은 물건을 다시 고르지 않게
function markBlogged(caseNo) {
  const h = history();
  if (!h.blogged.includes(caseNo)) h.blogged.push(caseNo);
  fs.mkdirSync(DIR, { recursive: true });
  writeJson(HISTORY, h);
  const f = todayFile();
  if (fs.existsSync(f)) writeJson(f, { ...readJson(f), status: 'saved', savedAt: new Date().toISOString() });
}

const today = () => (fs.existsSync(todayFile()) ? readJson(todayFile()) : null);

module.exports = { pick, run, markBlogged, today, history };
