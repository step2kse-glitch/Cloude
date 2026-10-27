const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { evaluate } = require('../src/evaluate');
const { writeReport } = require('../src/report');
const { config } = require('../src/lib/util');

const samples = path.join(__dirname, '..', 'samples');
const load = (f) => JSON.parse(fs.readFileSync(path.join(samples, f), 'utf8'));
const criteria = { ...config('criteria.json'), cashAvailable: 2e8 };

test('샘플 등급: A / B / X', () => {
  assert.strictEqual(evaluate(load('sample-A.json'), criteria).grade, 'A');
  assert.strictEqual(evaluate(load('sample-B.json'), criteria).grade, 'B');
  assert.strictEqual(evaluate(load('sample-X.json'), criteria).grade, 'X');
});

test('출구 전략 4가지 비교 + 목표별 추천', () => {
  const r = evaluate(load('sample-A.json'), criteria);
  assert.deepStrictEqual(r.strategy.options.map((o) => o.key), ['sell', 'jeonse', 'monthly', 'live']);
  assert.strictEqual(evaluate(load('sample-A.json'), { ...criteria, goal: '실거주' }).strategy.best, 'live');
});

test('리포트 md·html 생성', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'auction-'));
  const cases = ['sample-A.json', 'sample-B.json', 'sample-X.json'].map((f) => {
    const c = load(f);
    return { ...c, result: evaluate(c, criteria) };
  });
  const out = writeReport(cases, { ...criteria, goal: '실거주' }, dir, { slug: 't' });
  const md = fs.readFileSync(out.md, 'utf8');
  assert.match(md, /내 집 후보 순위/);
  assert.match(md, /어떻게 쓰는 게 나을까/);
  assert.match(md, /명도 계획/);
  assert.match(fs.readFileSync(out.html, 'utf8'), /<table>/);
});
