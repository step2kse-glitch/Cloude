// 권리분석 + 수익계산 + 등급(A/B/C/X/보류) → 케이스 JSON 의 "result" 필드
const { analyze } = require('./analyze');
const { compute } = require('./calc');
const eviction = require('./eviction');
const strategy = require('./strategy');
const { config } = require('./lib/util');

function settingsFor(c, criteria) {
  return {
    buyer: { ...(criteria.buyer || {}), ...(c.buyer || {}) },
    targetMarginRate: c.targetMarginRate ?? criteria.targetMarginRate,
    cashAvailable: c.cashAvailable ?? criteria.cashAvailable,
    excludeRisks: criteria.excludeRisks || [],
    exit: c.exit || criteria.exit,
    goal: c.goal || criteria.goal,
  };
}

function grade(c, a, calc, s) {
  const reasons = [];
  const excluded = a.flags.filter((f) => s.excludeRisks.some((x) => f.includes(x)));
  if (a.fatal) reasons.push('선순위 가처분/가등기 — 소유권 상실 위험');
  if (excluded.length) reasons.push(`제외 리스크: ${excluded.join(', ')}`);
  if (calc.status === 'no') reasons.push(calc.verdict);
  const cash = calc.scenarios && calc.scenarios.mid.cashNeeded;
  if (cash && s.cashAvailable && cash > s.cashAvailable) reasons.push(`필요현금 부족 (${Math.round(cash / 1e4).toLocaleString()}만 > 가용 ${Math.round(s.cashAvailable / 1e4).toLocaleString()}만)`);
  if (reasons.length) return { grade: 'X', reasons };

  if (calc.status === 'pending') return { grade: '보류', reasons: [calc.verdict] };

  if (/관망/.test(calc.verdict)) reasons.push(calc.verdict);
  if (c.trend === '하락') reasons.push('시세 하락 추세');
  if (reasons.length) return { grade: 'C', reasons };

  if (a.questions.length) reasons.push(`미확인 ${a.questions.length}건 — 확인되면 재평가`);
  if (!calc.market.source) reasons.push('시세 출처 미기재');
  if (a.assumedAmount > 0) reasons.push(`대항력 임차인 — 낙찰가에 따라 보증금 인수 가능(최저가 낙찰 시 ${Math.round(a.assumedAmount / 1e4).toLocaleString()}만)`);
  if (reasons.length) return { grade: 'B', reasons };

  return { grade: 'A', reasons: ['인수 권리 없음 · 미확인 없음 · 목표 수익 확보'] };
}

function evaluate(c, criteria = config('criteria.json')) {
  const s = settingsFor(c, criteria);
  const a = analyze(c);
  let ev = eviction.plan(c, a);
  // 명도비를 직접 적지 않았으면 명도 계획의 예상 비용을 쓴다 (추정 표시)
  const costs = { ...(c.costs || {}) };
  const evictionEstimated = costs.evictionCost == null;
  if (evictionEstimated) costs.evictionCost = ev.expectedCost;
  const cc = { ...c, costs, exit: /실거주/.test(s.goal || '') ? 'live' : c.exit };
  const sx = { ...s, assumedAmount: a.assumedAmount, assumedAt: a.assumedAt };
  let calc = compute(cc, sx);
  // 추천가에선 임차인이 전액 배당받는다면 명도 유형을 다시 잡고 한 번 더 계산
  const rec = calc.bids && calc.bids.recommended;
  if (rec && a.assumedAmount > 0 && a.assumedAt(rec) === 0) {
    ev = eviction.plan(c, a, { fullyPaidAtBid: true });
    if (evictionEstimated) costs.evictionCost = ev.expectedCost;
    calc = compute(cc, sx);
  }
  const strat = strategy.compare(cc, sx, calc.bids && (calc.bids.recommended || calc.bids.ceiling), ev);
  const g = grade(c, a, calc, s);
  if (calc.bids && calc.bids.recommended) a.assumedAtRecommended = a.assumedAt(calc.bids.recommended);
  return { evaluatedAt: new Date().toISOString(), ...g, analysis: a, eviction: { ...ev, estimatedUsed: evictionEstimated }, calc, strategy: strat, settings: s };
}

module.exports = { evaluate };
