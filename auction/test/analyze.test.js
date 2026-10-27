const test = require('node:test');
const assert = require('node:assert');
const { analyze } = require('../src/analyze');

const base = (extra) => ({
  minPrice: 200000000,
  appraisal: 300000000,
  smallTenantRegion: '과밀억제',
  registry: [
    { type: '근저당', date: '2021-06-15', holder: '은행', amount: 100000000 },
    { type: '경매개시결정', date: '2024-01-10' },
  ],
  ...extra,
});

test('말소기준권리 = 가장 빠른 근저당·압류 계열', () => {
  const a = analyze(base({ registry: [{ type: '가압류', date: '2020-01-01', amount: 1 }, { type: '근저당', date: '2019-01-01', amount: 1 }] }));
  assert.strictEqual(a.baseRight.type, '근저당');
});

test('전입일이 말소기준일과 같은 날이면 대항력 없음, 하루 전이면 있음', () => {
  const same = analyze(base({ tenants: [{ moveIn: '2021-06-15', deposit: 1e8, demanded: false }] }));
  assert.strictEqual(same.tenants[0].opposable, false);
  const before = analyze(base({ tenants: [{ moveIn: '2021-06-14', deposit: 1e8, demanded: false }] }));
  assert.strictEqual(before.tenants[0].opposable, true);
});

test('대항력 임차인이 배당요구 안 하면 보증금 전액 인수', () => {
  const a = analyze(base({ tenants: [{ moveIn: '2020-01-01', fixedDate: '2020-01-01', deposit: 150000000, demanded: false }] }));
  assert.strictEqual(a.assumedAmount, 150000000);
});

test('대항력 임차인 배당요구 → 낙찰가가 높을수록 인수액 감소', () => {
  const a = analyze(base({ tenants: [{ moveIn: '2020-01-01', fixedDate: '2020-01-01', deposit: 250000000, demanded: true }] }));
  assert.ok(a.assumedAmount > 0);
  assert.strictEqual(a.assumedAt(300000000), 0);
});

test('소액임차인 최우선변제는 매각가 1/2 한도', () => {
  const tenants = [1, 2, 3].map((i) => ({ label: `t${i}`, moveIn: '2022-01-01', deposit: 40000000, demanded: true }));
  const a = analyze(base({ minPrice: 60000000, tenants }));
  const top = a.distribution.log.filter((l) => l.step.startsWith('최우선')).reduce((s, l) => s + l.amount, 0);
  assert.ok(top <= 30000000 + 1);
});

test('선순위 가처분은 인수 + 치명(fatal)', () => {
  const a = analyze(base({ registry: [{ type: '처분금지가처분', date: '2018-01-01' }, { type: '근저당', date: '2019-01-01', amount: 1 }] }));
  assert.strictEqual(a.fatal, true);
  assert.strictEqual(a.rights[0].status, '인수');
});

test('유치권은 순위와 무관하게 위험', () => {
  const a = analyze(base({ registry: [{ type: '근저당', date: '2019-01-01', amount: 1 }, { type: '유치권', date: '2023-01-01' }] }));
  assert.ok(a.flags.includes('유치권'));
});
