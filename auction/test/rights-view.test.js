const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { evaluate } = require('../src/evaluate');
const rv = require('../src/rights-view');
const { config } = require('../src/lib/util');

const load = (f) => JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'samples', f), 'utf8'));
const criteria = { ...config('criteria.json'), cashAvailable: 2e8 };
const run = (f) => {
  const c = load(f);
  return { c, r: evaluate(c, criteria) };
};

test('라벨: 깨끗 / 대항력 임차인 / 인수 권리', () => {
  for (const [f, want] of [['sample-A.json', '✅ 깨끗'], ['sample-B.json', '🏠 대항력 임차인'], ['sample-X.json', '❗인수 권리']]) {
    const { c, r } = run(f);
    assert.strictEqual(rv.label(c, r.analysis), want);
  }
});

test('타임라인은 날짜순이고 말소기준 선이 대항력 임차인 전입보다 아래', () => {
  const { c, r } = run('sample-B.json');
  const lines = rv.timeline(c, r.analysis).split('\n');
  const dates = lines.map((l) => l.slice(2, 12));
  assert.deepStrictEqual([...dates].sort(), dates);
  const tenant = lines.findIndex((l) => l.includes('임차인1 전입'));
  const base = lines.findIndex((l) => l.includes('말소기준권리'));
  assert.ok(tenant < base);
});

test('쉽게 말하면: 선순위 가처분은 떠안는 것으로 표시', () => {
  const { c, r } = run('sample-X.json');
  assert.match(rv.summary(c, r.analysis), /떠안는 것\*\*: 처분금지가처분/);
});

test('체크리스트: 명세서 특이사항 원문을 빼먹지 않음', () => {
  const { c, r } = run('sample-B.json');
  assert.match(rv.checklist(c, r.analysis), /❗ 명세서 특이사항 원문 확인/);
});
