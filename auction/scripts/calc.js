// 경매 수익·입찰가 계산기 (결정론적 계산만 — 판단은 Claude가, 숫자는 이 스크립트가)
// 사용: node auction/scripts/calc.js auction/cases/<사건>.json [--write]
//   --write : 계산 결과를 케이스 JSON의 "calc" 필드에 저장
const fs = require('fs');
const path = require('path');

const RATES = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'tax-rates.json'), 'utf8'));

const won = (n) => (n == null || Number.isNaN(n) ? '-' : Math.round(n).toLocaleString('ko-KR') + '원');
const eok = (n) => (n == null ? '-' : (n / 1e8).toFixed(2) + '억');
const pct = (r) => (r == null || !Number.isFinite(r) ? '-' : (r * 100).toFixed(1) + '%');

// 취득세 + 지방교육세 + 농특세 (단순화. tax-rates.json 참고)
function acquisitionTax(price, c) {
  const b = c.buyer || {};
  const area = Number(c.areaM2 || 0);
  if (!isHousing(c.usage)) {
    const t = RATES.nonHousing;
    return { rate: t.rate + t.eduTax + t.ruralTax, amount: price * (t.rate + t.eduTax + t.ruralTax), basis: '비주택 4%+교육+농특' };
  }
  const H = RATES.housing;
  const count = Math.max(1, Number(b.houseCountAfter || 1));
  const table = b.regulatedArea ? H.multi.regulated : H.multi.nonRegulated;
  let rate = count >= 2 ? table[String(Math.min(count, 4))] : 'basic';
  let basis;
  if (rate === 'basic') {
    if (price <= 6e8) rate = 0.01;
    else if (price <= 9e8) rate = Math.round(((price / 1e8) * (2 / 3) - 3) * 100) / 10000;
    else rate = 0.03;
    const edu = rate * H.eduTaxRatioOfBasic;
    const rural = area > 85 ? H.ruralTaxOver85m2.basic : 0;
    basis = `주택 ${count}주택 기본세율 ${pct(rate)}`;
    return { rate: rate + edu + rural, amount: price * (rate + edu + rural), basis };
  }
  const rural = area > 85 ? H.ruralTaxOver85m2[String(rate)] || 0 : 0;
  basis = `주택 ${count}주택 ${b.regulatedArea ? '조정' : '비조정'} 중과 ${pct(rate)}`;
  return { rate: rate + H.eduTaxMulti + rural, amount: price * (rate + H.eduTaxMulti + rural), basis };
}

function isHousing(usage) {
  return /아파트|주택|빌라|다세대|연립|다가구|단독/.test(String(usage || ''));
}

// 낙찰가 B 일 때의 총비용·현금·수익
function scenario(B, exitPrice, c) {
  const b = c.buyer || {};
  const tax = acquisitionTax(B, c);
  const transfer = B * RATES.misc.transferRate + RATES.misc.transferFixed;
  const extra =
    Number(c.assumedAmount || 0) + // 인수해야 하는 권리·보증금
    Number(c.evictionCost || 0) + // 명도비(이사비)
    Number(c.repairCost || 0) +
    Number(c.unpaidMgmtFee || 0); // 체납관리비 공용부분
  const loan = B * Number(b.loanRatio || 0);
  const months = Number(b.holdMonths || 12);
  const interest = loan * Number(b.interestRate || 0) * (months / 12);
  const holding = Number(c.monthlyHoldingCost || 0) * months; // 관리비·보유세 월 환산
  const totalCost = B + tax.amount + transfer + extra + interest + holding;
  const cashNeeded = B - loan + tax.amount + transfer + extra;

  let saleCost = 0;
  let cgt = 0;
  let income = 0;
  const exit = c.exit || 'sell';
  if (exit === 'sell') {
    saleCost = exitPrice * RATES.sale.brokerRate;
    const gain = exitPrice - saleCost - (B + tax.amount + transfer + Number(c.repairCost || 0) + Number(c.assumedAmount || 0));
    const st = isHousing(c.usage) ? RATES.sale.shortTermHousing.find((s) => months < s.underMonths) : null;
    if (!st) cgt = null; // 단기 주택 외에는 추정하지 않음 (세무사 확인)
    else if (gain > 0) cgt = gain * st.rate;
    income = exitPrice;
  } else if (exit === 'rent') {
    income = exitPrice + Number(c.rentMonthly || 0) * months; // 보유 종료 시점 가치 + 월세
  } else {
    income = exitPrice; // 실거주: 시세 대비 싸게 산 만큼이 이익
  }
  const profit = income - saleCost - (cgt || 0) - totalCost;
  return { B, tax, transfer, extra, loan, interest, holding, totalCost, cashNeeded, saleCost, cgt, profit, roiOnCash: profit / cashNeeded };
}

// profit(B) 가 목표 이상인 최대 B (이분 탐색)
function maxBid(exitPrice, c, targetMarginRate) {
  let lo = 0;
  let hi = exitPrice * 1.2;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    const s = scenario(mid, exitPrice, c);
    if (s.profit >= s.totalCost * targetMarginRate) lo = mid;
    else hi = mid;
  }
  return Math.floor(lo / 1000) * 1000;
}

// 끝자리 조정: 만원 단위 반올림 경쟁 회피용 (예: 312,470,000 → 312,477,000)
function oddEnding(n) {
  const base = Math.floor(n / 10000) * 10000;
  return base + 7000;
}

function run(file, write) {
  const c = JSON.parse(fs.readFileSync(file, 'utf8'));
  const mp = c.marketPrice || {};
  const need = ['appraisal', 'minPrice'];
  const missing = need.filter((k) => !c[k]).concat(mp.mid ? [] : ['marketPrice.mid']);
  if (missing.length) {
    console.error(`❌ 필수 값 없음: ${missing.join(', ')} — 지어내지 말고 확인 후 채울 것`);
    process.exit(1);
  }
  const target = Number(c.targetMarginRate ?? 0.1);
  const low = mp.low || mp.mid * 0.95;
  const high = mp.high || mp.mid * 1.05;

  const bidAtMid = maxBid(mp.mid, c, target); // 기준 시세에서 목표 마진
  const bidAtLowBreakEven = maxBid(low, c, 0); // 보수 시세에서 손해 안 보는 선
  const ceiling = Math.min(bidAtMid, bidAtLowBreakEven);
  const recommended = ceiling >= c.minPrice ? Math.max(c.minPrice, oddEnding(ceiling * 0.97)) : null;
  const deposit = c.minPrice * Number(c.depositRate || 0.1);

  const bids = {
    conservative: Math.max(c.minPrice, oddEnding(ceiling * 0.92)),
    recommended,
    ceiling,
  };
  const at = (B) => ({
    low: scenario(B, low, c),
    mid: scenario(B, mp.mid, c),
    high: scenario(B, high, c),
  });

  const out = {
    computedAt: new Date().toISOString(),
    targetMarginRate: target,
    deposit,
    minPriceRatio: c.minPrice / c.appraisal,
    minPriceVsMarket: c.minPrice / mp.mid,
    bids,
    verdict:
      recommended == null
        ? '입찰 비추천 — 최저가가 손익 상한을 넘음'
        : ceiling / c.minPrice < 1.05
          ? '관망 — 상한과 최저가 차이 5% 미만 (경쟁 시 이익 거의 없음)'
          : '검토 가능',
    scenarios: recommended ? summarize(at(recommended)) : null,
  };

  print(c, out, low, high);
  if (write) {
    c.calc = out;
    fs.writeFileSync(file, JSON.stringify(c, null, 2));
    console.log(`\n💾 ${file} 의 "calc" 필드에 저장`);
  }
}

function summarize(s) {
  const pick = (x) => ({
    totalCost: Math.round(x.totalCost),
    cashNeeded: Math.round(x.cashNeeded),
    tax: Math.round(x.tax.amount),
    taxBasis: x.tax.basis,
    interest: Math.round(x.interest),
    cgt: x.cgt == null ? null : Math.round(x.cgt),
    profit: Math.round(x.profit),
    roiOnCash: x.roiOnCash,
  });
  return { low: pick(s.low), mid: pick(s.mid), high: pick(s.high) };
}

function print(c, o, low, high) {
  const mp = c.marketPrice;
  console.log(`\n=== ${c.caseNo || path.basename(c._file || '')} ${c.address || ''}`);
  console.log(`감정가 ${won(c.appraisal)} / 최저가 ${won(c.minPrice)} (${pct(o.minPriceRatio)}, 유찰 ${c.failCount ?? '?'}회)`);
  console.log(`시세 보수 ${eok(low)} · 기준 ${eok(mp.mid)} · 낙관 ${eok(high)}  [출처: ${mp.source || '❗미기재'}]`);
  console.log(`입찰보증금 ${won(o.deposit)}`);
  console.log(`\n입찰가  보수 ${won(o.bids.conservative)} | 추천 ${won(o.bids.recommended)} | 상한(넘으면 포기) ${won(o.bids.ceiling)}`);
  console.log(`판정: ${o.verdict}`);
  if (o.scenarios) {
    for (const [k, label] of [['low', '보수'], ['mid', '기준'], ['high', '낙관']]) {
      const s = o.scenarios[k];
      console.log(`  [${label}] 필요현금 ${won(s.cashNeeded)} · 취득세 ${won(s.tax)}(${s.taxBasis}) · 이자 ${won(s.interest)} · 양도세 ${s.cgt == null ? '미반영' : '추정 ' + won(s.cgt)} → 이익 ${won(s.profit)} (현금 대비 ${pct(s.roiOnCash)})`);
    }
  }
  console.log('\n※ 세율은 data/tax-rates.json 단순화 값. 감면·중과·양도세는 세무사 확인 필수.');
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const file = args.find((a) => !a.startsWith('--'));
  if (!file) {
    console.error('사용: node auction/scripts/calc.js auction/cases/<사건>.json [--write]');
    process.exit(1);
  }
  run(file, args.includes('--write'));
}

module.exports = { acquisitionTax, scenario, maxBid };
