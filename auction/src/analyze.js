// 권리분석 엔진 (결정론적): 말소기준권리 → 권리별 소멸/인수 → 임차인 대항력 → 간이 배당 → 낙찰자 인수액
// 입력은 Claude가 서류에서 옮긴 케이스 JSON (형식: auction/samples/*.json). 판단 규칙은 knowledge/rights-guide.md 와 1:1.
// 원칙: 애매하면 낙찰자에게 불리한 쪽(인수액 많게)으로 계산하고 warnings 에 이유를 남긴다.
const { config, toDate, ymd, addDays } = require('./lib/util');

const BASE_TYPES = /근저당|저당|압류|담보가등기|경매개시/; // 가압류 포함('압류' 매치)
const SECURED_TYPES = /근저당|저당|담보가등기|전세권/; // 소액임차인 기준일 판단용 담보물권
const ALWAYS_RISK = /유치권|법정지상권|분묘기지권|철거|토지인도/;
const ASSUME_IF_SENIOR = /가처분|가등기|지상권|지역권|전세권|임차권|환매/;
const FATAL_SENIOR = /가처분|소유권이전.*가등기|^가등기$/; // 선순위면 소유권 자체를 잃을 수 있음

function sortByDate(list) {
  return list
    .map((x, i) => ({ ...x, _i: i, _d: toDate(x.date) }))
    .sort((a, b) => (a._d && b._d ? a._d - b._d || a._i - b._i : a._d ? -1 : 1));
}

function findBaseRight(registry) {
  const cands = sortByDate(registry).filter((r) => {
    if (!r._d) return false;
    if (/담보가등기/.test(r.type)) return true;
    if (/전세권/.test(r.type)) return r.wholeBuilding !== false && (r.demanded || r.applicant);
    return BASE_TYPES.test(r.type) && !/가처분/.test(r.type);
  });
  return cands[0] || null;
}

function classifyRights(registry, base, warnings) {
  return sortByDate(registry).map((r) => {
    let status;
    let reason;
    if (ALWAYS_RISK.test(r.type)) {
      status = '위험';
      reason = '순위와 무관하게 인수될 수 있는 권리';
    } else if (base && r._i === base._i) {
      status = '말소기준';
      reason = '가장 빠른 말소기준 후보';
    } else if (!r._d) {
      status = '❓';
      reason = '날짜 미확인';
      warnings.push(`등기 "${r.type}" 날짜 미확인`);
    } else if (!base || r._d < base._d) {
      if (/전세권/.test(r.type) && r.demanded) {
        status = '소멸';
        reason = '선순위 전세권이지만 배당요구 → 소멸';
      } else if (ASSUME_IF_SENIOR.test(r.type) && !/담보가등기/.test(r.type)) {
        status = '인수';
        reason = '말소기준보다 앞선 용익·보전 권리';
      } else {
        status = '소멸';
        reason = base ? '말소기준보다 앞서지만 담보·압류 계열(배당으로 소멸)' : '말소기준 미확정';
      }
    } else {
      status = '소멸';
      reason = '말소기준 이후';
    }
    return { type: r.type, date: r.date || null, holder: r.holder || null, amount: r.amount ?? null, tenantLabel: r.tenantLabel || null, status, reason, fatal: status === '인수' && FATAL_SENIOR.test(r.type) };
  });
}

function smallTenantRule(registry, region, warnings) {
  const table = config('small-tenant.json');
  const secured = sortByDate(registry).find((r) => r._d && SECURED_TYPES.test(r.type));
  const baseDate = secured ? secured._d : new Date();
  const period = table.periods.find((p) => toDate(p.from) <= baseDate);
  if (!region || !table.regions.includes(region)) {
    warnings.push('소액임차인 지역 구분(smallTenantRegion) 미기재 → 최우선변제 0으로 보수 계산');
    return null;
  }
  if (!period) {
    warnings.push(`소액임차인 기준일 ${ymd(baseDate)} 이 기준표 범위 밖 → 최우선변제 0으로 보수 계산 (small-tenant.json 보강 필요)`);
    return null;
  }
  const [limit, protect] = period[region];
  return { baseDate: ymd(baseDate), from: period.from, region, limit, protect };
}

// 간이 배당: 경매비용 → 최우선(소액임차인, 매각가 1/2 한도) → 당해세 → 날짜순(담보·확정일자·조세·가압류)
function distribute(c, price, tenants, rule, warnings) {
  const registry = c.registry || [];
  const auctionCost = c.auctionCost ?? Math.max(2000000, price * 0.003);
  let pool = Math.max(0, price - auctionCost);
  const paid = new Map(tenants.map((t) => [t.label, 0]));
  const log = [{ step: '경매비용(추정)', amount: Math.min(auctionCost, price) }];

  const opening = sortByDate(registry).find((r) => /경매개시/.test(r.type));
  if (rule) {
    const elig = tenants.filter((t) => {
      if (!t.demanded || !t.deposit || t.deposit > rule.limit) return false;
      const mi = toDate(t.moveIn);
      if (!mi) return false;
      if (opening && opening._d && !(mi < opening._d)) return false;
      return true;
    });
    if (!opening) warnings.push('경매개시결정등기 날짜 미기재 → 소액임차인 전입 시점 요건 확인 불가(전입일로만 판정)');
    const want = elig.map((t) => Math.min(t.deposit, rule.protect));
    const total = want.reduce((a, b) => a + b, 0);
    const cap = Math.min(pool, price / 2);
    const ratio = total > cap ? cap / total : 1;
    elig.forEach((t, i) => {
      const amt = want[i] * ratio;
      paid.set(t.label, amt);
      pool -= amt;
      log.push({ step: `최우선변제 ${t.label}`, amount: amt });
    });
  }

  for (const t of c.taxes || []) {
    if (/당해세/.test(t.kind) && t.amount) {
      const amt = Math.min(pool, t.amount);
      pool -= amt;
      log.push({ step: '당해세', amount: amt });
    }
  }

  const claims = [];
  for (const r of registry) {
    if (!r.amount || !toDate(r.date)) continue;
    if (/근저당|저당|담보가등기|압류|가압류/.test(r.type) || (/전세권/.test(r.type) && r.demanded)) {
      claims.push({ who: `${r.type} ${r.holder || ''}`.trim(), d: toDate(r.date), amount: r.amount, order: 0 });
      if (/가압류/.test(r.type) && tenants.length) warnings.push('가압류 이후 채권은 실제로 안분배당 — 순차 배당으로 단순화(임차인에게 보수적)');
    }
  }
  for (const t of c.taxes || []) {
    if (!/당해세/.test(t.kind) && t.amount && toDate(t.date)) claims.push({ who: '조세', d: toDate(t.date), amount: t.amount, order: 0 });
  }
  for (const t of tenants) {
    if (!t.demanded || !t.priorityDate) continue;
    const rest = (t.deposit || 0) - paid.get(t.label);
    if (rest > 0) claims.push({ who: t.label, d: t.priorityDate, amount: rest, order: 1, tenant: t.label });
  }
  claims.sort((a, b) => a.d - b.d || a.order - b.order); // 같은 날이면 등기 먼저(임차인에게 보수적)
  for (const cl of claims) {
    const amt = Math.min(pool, cl.amount);
    pool -= amt;
    if (cl.tenant) paid.set(cl.tenant, paid.get(cl.tenant) + amt);
    log.push({ step: `${ymd(cl.d)} ${cl.who}`, amount: amt });
  }
  log.push({ step: '잉여(채무자)', amount: pool });
  return { price, paid, log };
}

function analyze(c) {
  const warnings = [];
  const questions = [];
  const registry = c.registry || [];
  if (!registry.length) questions.push('등기부(갑구·을구) 권리 목록이 없음 — 매각물건명세서/등기부에서 옮겨야 함');

  const base = findBaseRight(registry);
  if (registry.length && !base) warnings.push('말소기준권리를 찾지 못함 → 모든 선순위 권리를 인수로 간주');
  const rights = classifyRights(registry, base, warnings);

  const tenantsIn = c.tenants || [];
  if (c.tenantsUnknown) questions.push('점유자/임차인 확인 안 됨(폐문부재 등) — 전입세대열람 필요');
  const tenants = tenantsIn.map((t, i) => {
    const label = t.label || `임차인${i + 1}`;
    const mi = toDate(t.moveIn);
    const fx = toDate(t.fixedDate);
    if (!mi) questions.push(`${label} 전입일 미확인`);
    if (t.deposit == null) questions.push(`${label} 보증금 미확인`);
    if (t.demanded == null) questions.push(`${label} 배당요구 여부 미확인`);
    // 대항력: 전입 다음날 0시 효력 → 전입일이 말소기준일보다 "앞선 날"이어야 함 (같은 날이면 없음)
    const opposable = mi ? (base ? mi < base._d : true) : true; // 모르면 있다고 보고 보수 계산
    const priorityDate = mi && fx ? new Date(Math.max(addDays(mi, 1), fx)) : null;
    return { label, moveIn: t.moveIn || null, fixedDate: t.fixedDate || null, demanded: !!t.demanded, deposit: Number(t.deposit || 0), monthly: Number(t.monthly || 0), opposable, priorityDate, unknown: !mi };
  });

  const rule = tenants.length ? smallTenantRule(registry, c.smallTenantRegion, warnings) : null;
  const assumedRights = rights.filter((r) => r.status === '인수');
  const riskRights = rights.filter((r) => r.status === '위험');
  // 선순위 전세권·임차권등기 금액도 인수. 임차인 목록과 같은 사람이면(tenantLabel 연결) 이중계산하지 않음
  const rightsAssumedAmount = assumedRights
    .filter((r) => /전세권|임차권/.test(r.type) && !r.tenantLabel)
    .reduce((a, r) => a + Number(r.amount || 0), 0);

  // 낙찰가 price 일 때 배당과 낙찰자 인수액 (높게 낙찰될수록 대항력 임차인 배당↑ → 인수↓)
  const atPrice = (price, warn = []) => {
    const dist = distribute(c, price, tenants, rule, warn);
    const rows = tenants.map((t) => {
      const got = dist.paid.get(t.label) || 0;
      let assumed = 0;
      if (t.opposable) assumed = t.demanded ? Math.max(0, t.deposit - got) : t.deposit;
      return { label: t.label, got, assumed };
    });
    return { dist, rows, assumed: rows.reduce((a, r) => a + r.assumed, 0) + rightsAssumedAmount };
  };

  // 표시는 최저가 낙찰 가정(가장 불리한 경우). 입찰가 계산은 assumedAt(입찰가)로 낙찰가별 재계산.
  const worst = atPrice(c.minPrice || 0, warnings);
  const dist = worst.dist;
  const tenantResults = tenants.map((t, i) => {
    const { got, assumed } = worst.rows[i];
    const eviction = t.opposable && assumed === 0 ? '낮음(전액 배당 → 명도확인서 필요해 협조적)' : !t.opposable && got < t.deposit ? '높음(보증금 손실 임차인 — 인도명령 준비)' : t.opposable ? '중(인수 보증금 반환 후 퇴거)' : '중';
    return { ...t, priorityDate: t.priorityDate ? ymd(t.priorityDate) : null, distributed: Math.round(got), assumed: Math.round(assumed), eviction };
  });
  const assumedAmount = worst.assumed;

  const flags = [...new Set([...(c.flags || []), ...riskRights.map((r) => r.type), ...assumedRights.filter((r) => r.fatal).map((r) => `선순위 ${r.type}`)])];

  const result = {
    baseRight: base ? { type: base.type, date: base.date, holder: base.holder || null } : null,
    rights,
    smallTenantRule: rule,
    tenants: tenantResults,
    distribution: { assumedPrice: dist.price, log: dist.log.map((l) => ({ ...l, amount: Math.round(l.amount) })) },
    assumedAmount: Math.round(assumedAmount),
    flags,
    fatal: assumedRights.some((r) => r.fatal),
    warnings: [...new Set(warnings)],
    questions: [...new Set(questions)],
  };
  // JSON 저장 시 빠지는 계산용 함수
  Object.defineProperty(result, 'assumedAt', { value: (price) => Math.round(atPrice(price).assumed), enumerable: false });
  return result;
}

module.exports = { analyze, findBaseRight };
