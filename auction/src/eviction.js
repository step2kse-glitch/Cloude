// 명도 계획: 점유자 유형별 방법·기간·비용 시나리오 (금액은 config/costs.json 추정치)
const { config } = require('./lib/util');

// opts.fullyPaidAtBid: 추천가로 낙찰되면 임차인이 전액 배당받는 경우 (최저가 기준 판단을 덮어씀)
function plan(c, analysis, opts = {}) {
  const E = config('costs.json').eviction;
  const area = Number(c.areaM2 || 60);
  const forced = E.forcedExecution.fixed + area * E.forcedExecution.perM2 + E.forcedExecution.storageMonthly * E.forcedExecution.storageMonths;
  const pay = E.moveOutPayment;
  const tenants = analysis.tenants || [];
  const occupant = String(c.occupant || '');

  let type;
  let steps;
  let expectedCost;
  let months;
  if (!tenants.length && /공실|비어/.test(occupant)) {
    type = '공실';
    steps = ['잔금 납부 후 관리사무소·집행관과 공실 확인', '인도명령 신청 후 집행관 입회 개문(짐 있으면 보관 처리)'];
    expectedCost = 1000000;
    months = E.months.vacant;
  } else if (!tenants.length) {
    type = c.tenantsUnknown ? '점유자 미확인' : '소유자(채무자) 점유';
    steps = [
      '낙찰 직후 방문·편지로 이사 일정 대화 (첫 연락은 부드럽게)',
      '잔금 납부와 동시에 인도명령 신청 (6개월 이내 필수)',
      `이사비 협의 범위 ${pay.low / 1e4}~${pay.high / 1e4}만 — 합의서 작성, 열쇠 받을 때 지급`,
      '불응 시 인도명령 결정문 송달 → 강제집행 신청 (계고 → 집행)',
    ];
    expectedCost = pay.mid;
    months = E.months.order;
  } else {
    const allPaid = opts.fullyPaidAtBid || tenants.every((t) => t.distributed >= t.deposit);
    const lossTenant = tenants.some((t) => !t.opposable && t.distributed < t.deposit);
    const assumed = !opts.fullyPaidAtBid && tenants.some((t) => t.assumed > 0);
    if (assumed) {
      type = '대항력 임차인(보증금 일부 인수)';
      steps = ['인수할 보증금 잔액을 반환해야 퇴거 — 반환 자금 미리 확보', '임대차 승계 후 계약 만료까지 보유하는 것도 선택지(전세 출구와 같은 효과)'];
      expectedCost = pay.low;
      months = E.months.agreed;
    } else if (allPaid) {
      type = '임차인 전액 배당';
      steps = ['임차인은 배당을 받으려면 낙찰자의 명도확인서·인감증명이 필요 → 이사 날짜와 맞교환', '배당기일 일정 맞춰 이사 합의 (이사비 대개 불필요)'];
      expectedCost = 0;
      months = E.months.agreed;
    } else if (lossTenant) {
      type = '보증금 손실 임차인(대항력 없음)';
      steps = [
        '감정적으로 어려운 상대 — 손실 사정을 듣고 이사 시간·이사비로 협상',
        '잔금 납부와 동시에 인도명령 신청',
        `이사비 ${pay.mid / 1e4}~${pay.high / 1e4}만 범위 협의, 합의서 작성`,
        '불응 시 강제집행 (일정 여유 두기)',
      ];
      expectedCost = pay.high;
      months = E.months.order;
    } else {
      type = '임차인 일부 배당';
      steps = ['명도확인서 교부를 조건으로 이사 일정 합의', '잔금 납부와 동시에 인도명령 신청'];
      expectedCost = pay.mid;
      months = E.months.agreed;
    }
  }
  return {
    type,
    steps,
    expectedCost,
    worstCost: expectedCost + forced,
    forcedExecutionCost: Math.round(forced),
    months,
    note: '금액·기간은 추정치. 점유자에게 위협·무단진입·단전단수 금지(형사 문제).',
  };
}

module.exports = { plan };
