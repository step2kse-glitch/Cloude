// 수익·입찰가 계산 (결정론적). 세율은 config/tax-rates.json.
// compute(케이스, 설정) → 입찰가(보수/추천/상한)·시나리오(보수/기준/낙관)·판정
const { config } = require('./lib/util');

const isHousing = (usage) => /아파트|주택|빌라|다세대|연립|다가구|단독/.test(String(usage || ''));

// 취득세 + 지방교육세 + 농특세 (단순화)
function acquisitionTax(price, c, buyer) {
  const R = config('tax-rates.json');
  const area = Number(c.areaM2 || 0);
  if (!isHousing(c.usage)) {
    const t = R.nonHousing;
    const rate = t.rate + t.eduTax + t.ruralTax;
    return { rate, amount: price * rate, basis: '비주택 4%+교육세+농특세' };
  }
  const H = R.housing;
  const count = Math.max(1, Number(buyer.houseCountAfter || 1));
  const table = buyer.regulatedArea ? H.multi.regulated : H.multi.nonRegulated;
  const multi = count >= 2 ? table[String(Math.min(count, 4))] : 'basic';
  if (multi === 'basic') {
    let rate;
    if (price <= 6e8) rate = 0.01;
    else if (price <= 9e8) rate = Math.round(((price / 1e8) * (2 / 3) - 3) * 100) / 10000;
    else rate = 0.03;
    const total = rate + rate * H.eduTaxRatioOfBasic + (area > 85 ? H.ruralTaxOver85m2.basic : 0);
    return { rate: total, amount: price * total, basis: `${count}주택 기본 ${(rate * 100).toFixed(2)}%` };
  }
  const total = multi + H.eduTaxMulti + (area > 85 ? H.ruralTaxOver85m2[String(multi)] || 0 : 0);
  return { rate: total, amount: price * total, basis: `${count}주택 ${buyer.regulatedArea ? '조정' : '비조정'} 중과 ${multi * 100}%` };
}

// 낙찰가 B, 출구 가격 exitPrice 일 때
function scenario(B, exitPrice, c, s) {
  const R = config('tax-rates.json');
  const buyer = s.buyer;
  const k = c.costs || {};
  const tax = acquisitionTax(B, c, buyer);
  const transfer = B * R.misc.transferRate + R.misc.transferFixed;
  const assumed = (s.assumedAt ? s.assumedAt(B) : Number(s.assumedAmount || 0)) + Number(k.extraAssumed || 0);
  const extra = assumed + Number(k.evictionCost || 0) + Number(k.repairCost || 0) + Number(k.unpaidMgmtFee || 0);
  const months = Number(buyer.holdMonths || 12);
  const loan = B * Number(buyer.loanRatio || 0);
  const interest = loan * Number(buyer.interestRate || 0) * (months / 12);
  const holding = Number(k.monthlyHoldingCost || 0) * months;
  const totalCost = B + tax.amount + transfer + extra + interest + holding;
  const cashNeeded = B - loan + tax.amount + transfer + extra;

  let saleCost = 0;
  let cgt = null;
  let income = exitPrice;
  const exit = c.exit || s.exit || 'sell';
  if (exit === 'sell') {
    saleCost = exitPrice * R.sale.brokerRate;
    const short = isHousing(c.usage) ? R.sale.shortTermHousing.find((x) => months < x.underMonths) : null;
    if (short) {
      const gain = exitPrice - saleCost - (B + tax.amount + transfer + Number(k.repairCost || 0) + assumed);
      cgt = gain > 0 ? gain * short.rate : 0;
    }
  } else if (exit === 'rent') {
    income += Number(c.rentMonthly || 0) * months;
  }
  const profit = income - saleCost - (cgt || 0) - totalCost;
  return { B, tax, transfer, extra, loan, interest, holding, totalCost, cashNeeded, saleCost, cgt, profit, roiOnCash: profit / cashNeeded };
}

// profit ≥ totalCost × margin 을 만족하는 최대 낙찰가 (이분 탐색, 천원 단위 내림)
function maxBid(exitPrice, c, s, margin) {
  let lo = 0;
  let hi = exitPrice * 1.2;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    const x = scenario(mid, exitPrice, c, s);
    if (x.profit >= x.totalCost * margin) lo = mid;
    else hi = mid;
  }
  return Math.floor(lo / 1000) * 1000;
}

// 끝자리: 만원 단위 동가 경쟁 회피 (312,470,000 → 312,477,000)
const oddEnding = (n) => Math.floor(n / 10000) * 10000 + 7000;

function compute(c, s) {
  const mp = c.marketPrice || {};
  if (!mp.mid) return { status: 'pending', verdict: '계산 보류 — 시세(marketPrice.mid) 미확인' };
  if (!c.minPrice || !c.appraisal) return { status: 'pending', verdict: '계산 보류 — 감정가/최저가 미확인' };
  const low = mp.low || mp.mid * 0.95;
  const high = mp.high || mp.mid * 1.05;
  const margin = Number(s.targetMarginRate ?? 0.1);

  const ceiling = Math.min(maxBid(mp.mid, c, s, margin), maxBid(low, c, s, 0));
  const ok = ceiling >= c.minPrice;
  const bids = {
    conservative: ok ? Math.min(ceiling, Math.max(c.minPrice, oddEnding(ceiling * 0.92))) : null,
    recommended: ok ? Math.min(ceiling, Math.max(c.minPrice, oddEnding(ceiling * 0.97))) : null,
    ceiling,
  };
  const pick = (x) => ({
    cashNeeded: Math.round(x.cashNeeded),
    tax: Math.round(x.tax.amount),
    taxBasis: x.tax.basis,
    interest: Math.round(x.interest),
    cgt: x.cgt == null ? null : Math.round(x.cgt),
    profit: Math.round(x.profit),
    roiOnCash: x.roiOnCash,
  });
  const B = bids.recommended || c.minPrice;
  const scenarios = { low: pick(scenario(B, low, c, s)), mid: pick(scenario(B, mp.mid, c, s)), high: pick(scenario(B, high, c, s)) };
  let verdict;
  if (!ok) verdict = '입찰 비추천 — 최저가가 손익 상한을 넘음';
  else if (ceiling / c.minPrice < 1.05) verdict = '관망 — 상한과 최저가 차이 5% 미만';
  else verdict = '검토 가능';
  return {
    status: ok ? 'ok' : 'no',
    verdict,
    market: { low, mid: mp.mid, high, source: mp.source || null },
    margin,
    deposit: Math.round(c.minPrice * Number(c.depositRate || 0.1)),
    minPriceRatio: c.minPrice / c.appraisal,
    minPriceVsMarket: c.minPrice / mp.mid,
    bids,
    scenarios,
  };
}

// 가진 현금으로 잔금일까지 감당 가능한 최대 낙찰가 (대출·세금·이전비·기본 명도/수리비 포함)
function affordableBid(cash, s, sample = {}) {
  const c = { usage: sample.usage || '아파트', areaM2: sample.areaM2 || 84, costs: sample.costs || { evictionCost: 3000000, repairCost: 5000000 } };
  let lo = 0;
  let hi = cash * 20;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (scenario(mid, mid, c, s).cashNeeded <= cash) lo = mid;
    else hi = mid;
  }
  return Math.floor(lo / 1e6) * 1e6;
}

module.exports = { compute, acquisitionTax, scenario, maxBid, affordableBid };
