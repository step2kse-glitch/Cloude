const test = require('node:test');
const assert = require('node:assert');
const { acquisitionTax, compute, affordableBid } = require('../src/calc');

const buyer1 = { houseCountAfter: 1 };

test('1주택 6억 이하 취득세 1.1% (85㎡ 이하)', () => {
  const t = acquisitionTax(5e8, { usage: '아파트', areaM2: 84 }, buyer1);
  assert.strictEqual(Math.round(t.amount), 5500000);
});

test('조정지역 2주택 8% 중과', () => {
  const t = acquisitionTax(5e8, { usage: '아파트', areaM2: 84 }, { houseCountAfter: 2, regulatedArea: true });
  assert.ok(t.rate >= 0.084);
});

test('비주택 4.6%', () => {
  const t = acquisitionTax(1e8, { usage: '상가' }, buyer1);
  assert.strictEqual(Math.round(t.amount), 4600000);
});

test('입찰가: 보수 ≤ 추천 ≤ 상한, 최저가 이상', () => {
  const c = { usage: '아파트', areaM2: 84, appraisal: 5e8, minPrice: 3.5e8, marketPrice: { mid: 4.8e8 } };
  const r = compute(c, { buyer: { loanRatio: 0.6, interestRate: 0.05, holdMonths: 24, houseCountAfter: 1 }, targetMarginRate: 0.08 });
  assert.ok(r.bids.conservative <= r.bids.recommended && r.bids.recommended <= r.bids.ceiling);
  assert.ok(r.bids.conservative >= c.minPrice);
});

test('시세 없으면 계산 보류 (숫자 지어내지 않음)', () => {
  const r = compute({ appraisal: 1, minPrice: 1 }, { buyer: {} });
  assert.strictEqual(r.status, 'pending');
});

test('최저가가 시세보다 높으면 비추천', () => {
  const r = compute({ usage: '아파트', appraisal: 5e8, minPrice: 5e8, marketPrice: { mid: 4e8 } }, { buyer: { houseCountAfter: 1 }, targetMarginRate: 0.1 });
  assert.strictEqual(r.status, 'no');
});

test('예산: 현금이 많을수록 가능한 낙찰가 증가', () => {
  const s = { buyer: { loanRatio: 0.6, houseCountAfter: 1 } };
  assert.ok(affordableBid(3e8, s) > affordableBid(1e8, s));
});
