// 출구 전략 비교: 단기매도 / 2년 보유 매도 / 전세 / 월세 / 실거주
// 같은 낙찰가에서 "처음 넣을 돈 · 최종으로 묶이는 돈 · 기간 · 이익 · 연환산 수익률 · 위험"을 나란히 계산한다.
const { scenario, acquisitionTax } = require('./calc');
const { config } = require('./lib/util');

function compare(c, s, bid, evictionPlan) {
  const K = config('costs.json');
  const R = config('tax-rates.json');
  const mp = c.marketPrice || {};
  if (!mp.mid || !bid) return { options: [], best: null, note: '시세 또는 입찰가가 없어 비교 보류' };
  const rm = c.rentMarket || {};
  const buyer = s.buyer;
  const r = Number(buyer.interestRate || 0);
  const setup = Number(evictionPlan.months || 0) + K.lease.vacancyMonths; // 임대 세팅까지 개월
  const H = K.rentalHorizonMonths;
  const holdingM = Number((c.costs || {}).monthlyHoldingCost || 0);

  // 공통 취득 비용 (낙찰가 + 세금 + 이전비 + 인수·명도·수리·관리비)
  const base = scenario(bid, mp.mid, c, { ...s, buyer: { ...buyer, holdMonths: 0 } });
  const total = bid + base.tax.amount + base.transfer + base.extra;
  const L = base.loan;
  const firstHome = buyer.firstHome && Number(buyer.houseCountAfter || 1) === 1 && bid <= K.home.firstHomeTaxRelief.priceLimit;
  const relief = firstHome ? Math.min(K.home.firstHomeTaxRelief.max, base.tax.amount) : 0;
  const initialCash = base.cashNeeded - relief; // 잔금일에 필요한 현금
  const saleCost = mp.mid * R.sale.brokerRate;
  const options = [];
  const ann = (profit, cash, months) => (cash > 0 && months > 0 ? profit / cash / (months / 12) : null);

  // 1) 단기 매도
  {
    const m = Math.max(Number(buyer.holdMonths || 12), Math.ceil(evictionPlan.months + 2));
    const x = scenario(bid, mp.mid, { ...c, exit: 'sell' }, { ...s, buyer: { ...buyer, holdMonths: m } });
    options.push({
      key: 'sell', name: `매도 (${m}개월 보유)`, initialCash, lockedCash: initialCash, months: m,
      profit: Math.round(x.profit + relief), annualRoi: ann(x.profit + relief, initialCash, m),
      tax: x.cgt != null ? `양도세 추정 ${Math.round(x.cgt / 1e4).toLocaleString()}만 반영` : Number(buyer.houseCountAfter || 1) === 1 && m >= 24 ? '1세대1주택 2년 보유 비과세 가능(요건·거주요건 확인)' : '양도세 별도(세무사)',
      risks: ['매도 시점 시세 하락', m < 24 ? '단기 양도세 중과' : null].filter(Boolean),
    });
  }
  // 2) 전세 세팅 후 2년 보유
  if (rm.jeonse) {
    const J = rm.jeonse;
    const remainLoan = Math.max(0, L - J);
    const locked = total - J - remainLoan;
    const interest = L * r * (setup / 12) + remainLoan * r * (H / 12);
    const broker = J * K.lease.brokerRate.jeonse;
    const months = setup + H;
    const profit = mp.mid - saleCost - total - interest - broker - holdingM * setup + relief;
    const ratio = J / mp.mid;
    options.push({
      key: 'jeonse', name: `전세 (${(J / 1e8).toFixed(2)}억) 후 ${H}개월 보유`, initialCash, lockedCash: Math.round(locked), months,
      profit: Math.round(profit), annualRoi: locked > 0 ? ann(profit, locked, months) : Infinity,
      tax: '보유 후 매도 양도세 별도 · 시세 상승분 미반영(보수)',
      risks: [
        ratio > K.jeonseRiskRatio ? `전세가율 ${(ratio * 100).toFixed(0)}% — 역전세·보증보험 가입 거절 위험` : null,
        '경락잔금대출 상환·전세 동시 진행 가능 여부 은행 확인',
        locked < 0 ? '투자금보다 전세금이 커서 현금이 남음(플피) — 그만큼 반환 의무' : null,
      ].filter(Boolean),
    });
  }
  // 3) 월세 세팅 후 2년 보유
  if (rm.monthlyRent) {
    const D = Number(rm.monthlyDeposit || 0);
    const M = rm.monthlyRent;
    const remainLoan = Math.max(0, L - D);
    const locked = total - D - remainLoan;
    const interest = L * r * (setup / 12) + remainLoan * r * (H / 12);
    const broker = (D + M * 100) * K.lease.brokerRate.monthly;
    const months = setup + H;
    const income = M * H;
    const profit = mp.mid - saleCost + income - total - interest - broker - holdingM * setup + relief;
    const yearlyCash = M * 12 - remainLoan * r;
    options.push({
      key: 'monthly', name: `월세 (${Math.round(D / 1e4)}만/${Math.round(M / 1e4)}만) 후 ${H}개월 보유`, initialCash, lockedCash: Math.round(locked), months,
      profit: Math.round(profit), annualRoi: ann(profit, locked, months),
      monthlyCashflow: Math.round(yearlyCash / 12),
      tax: '임대소득세·보유 후 양도세 별도',
      risks: [yearlyCash < 0 ? '월세보다 이자가 커서 매달 적자' : null, '공실·수리 요청 관리 부담'].filter(Boolean),
    });
  }
  // 4) 실거주 — 같은 집을 일반 매매(급매가)로 살 때와 비교
  {
    const normal = (mp.low || mp.mid) * (1 + K.home.normalPurchaseBrokerRate) + acquisitionTax(mp.low || mp.mid, c, buyer).amount + base.transfer;
    const waitInterest = L * r * ((evictionPlan.months + 1) / 12); // 낙찰~입주까지 이자(그동안 다른 곳 거주 필요)
    const saving = normal - (total - relief) - waitInterest;
    options.push({
      key: 'live', name: '실거주', initialCash, lockedCash: initialCash, months: null,
      profit: Math.round(saving), annualRoi: null,
      monthlyCost: Math.round((L * r) / 12 + holdingM),
      tax: firstHome ? `생애최초 감면 ${Math.round(relief / 1e4)}만 반영` : '감면 미반영',
      risks: [`명도까지 약 ${evictionPlan.months}개월 + 잔금 1개월 → 입주 지연, 그동안 살 곳 필요`, saving < 0 ? '급매로 사는 것보다 비쌈 — 경매 의미 없음' : null].filter(Boolean),
      note: `급매가 기준 일반 매매보다 ${Math.round(saving / 1e4).toLocaleString()}만 절약`,
    });
  }

  const goal = String(s.goal || '');
  let best;
  if (/실거주/.test(goal)) best = 'live';
  else if (/매도/.test(goal)) best = 'sell';
  else {
    const cands = options.filter((o) => o.key !== 'live' && o.annualRoi != null && o.profit > 0 && !o.risks.some((x) => /역전세|적자/.test(x)));
    cands.sort((a, b) => b.annualRoi - a.annualRoi);
    best = cands[0] ? cands[0].key : options[0].key;
  }
  return { options, best, firstHomeRelief: relief, missing: [rm.jeonse ? null : '전세 시세', rm.monthlyRent ? null : '월세 시세'].filter(Boolean) };
}

module.exports = { compare };
