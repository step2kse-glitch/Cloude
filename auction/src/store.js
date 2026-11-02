// 케이스 저장소: workspace/cases/*.json 읽기·쓰기·전체 재평가 (cli·웹 서버 공용)
const fs = require('fs');
const path = require('path');
const { PATHS, readJson, writeJson, config, listCaseFiles } = require('./lib/util');
const { evaluate } = require('./evaluate');
const { verify } = require('./verify');

const idOf = (caseNo) => String(caseNo || '').replace(/[^\w가-힣-]/g, '_');
const fileOf = (id, dir = PATHS.cases) => path.join(dir, `${id}.json`);

function list(dir = PATHS.cases) {
  return listCaseFiles(dir)
    .filter((f) => !f.endsWith('.check.json'))
    .map((f) => ({ ...readJson(f), _id: path.basename(f, '.json') }));
}

function get(id, dir = PATHS.cases) {
  const f = fileOf(id, dir);
  return fs.existsSync(f) ? { ...readJson(f), _id: id } : null;
}

function save(c, dir = PATHS.cases) {
  const id = c._id || idOf(c.caseNo);
  const { _id, ...data } = c;
  writeJson(fileOf(id, dir), data);
  return id;
}

// 모든 케이스 재평가 (교차검증 파일이 있으면 같이)
function evaluateAll(dir = PATHS.cases, criteria = config('criteria.json')) {
  const cases = list(dir);
  const plain = cases.map(({ result, _id, ...c }) => c);
  // 1차: 낙찰 기록 없는 상태로 평가 → 2차: 다른 케이스의 결과·기록을 낙찰가율 근거로
  const out = cases.map((c, i) => {
    const { result: _old, _id, ...clean } = c;
    const result = evaluate(clean, criteria, { allCases: plain });
    const check = fileOf(_id, dir).replace(/\.json$/, '.check.json');
    if (fs.existsSync(check)) result.verification = verify(clean, readJson(check));
    const next = { ...clean, result, _id };
    save(next, dir);
    return next;
  });
  return out;
}

function remove(id, dir = PATHS.cases) {
  for (const f of [fileOf(id, dir), fileOf(id, dir).replace(/\.json$/, '.check.json')]) if (fs.existsSync(f)) fs.unlinkSync(f);
}

// 샘플 불러오기: 입찰일을 오늘 기준으로 옮겨 일정·D-day가 살아 있게 (sample-* 는 앞으로, past-* 는 지난 날짜)
const SAMPLE_OFFSET = { 'sample-A': 9, 'sample-B': 16, 'sample-X': 23, 'past-1': -20, 'past-2': -45, 'past-3': -70 };
function loadSamples(dir = PATHS.cases, { overwrite = false } = {}) {
  const { ymd, addDays } = require('./lib/util');
  const today = new Date(ymd(new Date()));
  for (const f of fs.readdirSync(PATHS.samples)) {
    const id = path.basename(f, '.json');
    if (!overwrite && get(id, dir)) continue;
    const c = readJson(path.join(PATHS.samples, f));
    const off = SAMPLE_OFFSET[id];
    if (off != null) {
      c.saleDate = ymd(addDays(today, off));
      if (c.outcome) c.outcome.date = c.saleDate;
    }
    save({ ...c, _id: id, watch: id.startsWith('sample-') && id !== 'sample-X' }, dir);
  }
}

module.exports = { list, get, save, remove, evaluateAll, idOf, loadSamples };
