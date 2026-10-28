// 공용: 경로, 금액·날짜 포맷, JSON 입출력
const fs = require('fs');
const path = require('path');

const AUCTION = path.resolve(__dirname, '..', '..');
const ROOT = path.resolve(AUCTION, '..');
const PATHS = {
  root: ROOT,
  auction: AUCTION,
  config: path.join(AUCTION, 'config'),
  samples: path.join(AUCTION, 'samples'),
  workspace: path.join(AUCTION, 'workspace'),
  raw: path.join(AUCTION, 'workspace', 'raw'),
  cases: path.join(AUCTION, 'workspace', 'cases'),
  reports: path.join(AUCTION, 'workspace', 'reports'),
};

const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const writeJson = (p, d) => {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(d, null, 2) + '\n');
};
const config = (name) => readJson(path.join(PATHS.config, name));

const won = (n) => (n == null || !Number.isFinite(n) ? '-' : Math.round(n).toLocaleString('ko-KR') + '원');
const eok = (n) => {
  if (n == null || !Number.isFinite(n)) return '-';
  const e = Math.floor(Math.abs(n) / 1e8);
  const man = Math.round((Math.abs(n) % 1e8) / 1e4);
  const sign = n < 0 ? '-' : '';
  if (!e) return `${sign}${man.toLocaleString('ko-KR')}만`;
  return `${sign}${e}억${man ? ' ' + man.toLocaleString('ko-KR') + '만' : ''}`;
};
const pct = (r) => (r == null || !Number.isFinite(r) ? '-' : (r * 100).toFixed(1) + '%');

// "2019.3.2" "2019-03-02" "20190302" → Date(UTC). 해석 불가면 null.
function toDate(s) {
  if (!s) return null;
  const m = String(s).match(/(\d{4})\D?(\d{1,2})\D?(\d{1,2})/);
  if (!m) return null;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}
const ymd = (d) => (d ? d.toISOString().slice(0, 10) : '-');
const addDays = (d, n) => new Date(d.getTime() + n * 86400000);

function listCaseFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.json') && !f.startsWith('_'))
    .map((f) => path.join(dir, f));
}

module.exports = { PATHS, readJson, writeJson, config, won, eok, pct, toDate, ymd, addDays, listCaseFiles };
