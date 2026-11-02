// 교차검증: 같은 서류를 따로 읽은 두 번째 추출본(<사건>.check.json)과 비교해 숫자·날짜 불일치를 찾는다.
// 두 번째 추출은 /auction 명령이 독립 서브에이전트로 만든다 (첫 번째 결과를 보지 않고).
const { toDate, ymd } = require('./lib/util');

const SCALARS = ['caseNo', 'saleDate', 'appraisal', 'minPrice', 'failCount', 'areaM2', 'depositRate', 'usage'];

const norm = (v) => {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return v;
  const d = toDate(v);
  if (d && /\d{4}\D?\d{1,2}\D?\d{1,2}/.test(String(v))) return ymd(d);
  return String(v).replace(/\s+/g, '');
};

function verify(a, b) {
  const rows = [];
  const cmp = (field, x, y) => rows.push({ field, first: x ?? null, second: y ?? null, ok: norm(x) === norm(y) });
  for (const k of SCALARS) cmp(k, a[k], b[k]);

  const key = (r) => `${String(r.type || '').replace(/\s/g, '')}|${norm(r.date)}`;
  const ra = a.registry || [];
  const rb = b.registry || [];
  const mb = new Map(rb.map((r) => [key(r), r]));
  for (const r of ra) {
    const o = mb.get(key(r));
    if (!o) rows.push({ field: `등기 ${r.type} ${r.date}`, first: '있음', second: '없음', ok: false });
    else {
      cmp(`등기 ${r.type} ${r.date} 금액`, r.amount, o.amount);
      mb.delete(key(r));
    }
  }
  for (const r of mb.values()) rows.push({ field: `등기 ${r.type} ${r.date}`, first: '없음', second: '있음', ok: false });

  const ta = a.tenants || [];
  const tb = b.tenants || [];
  if (ta.length !== tb.length) rows.push({ field: '임차인 수', first: ta.length, second: tb.length, ok: false });
  ta.forEach((t, i) => {
    const o = tb.find((x) => norm(x.moveIn) === norm(t.moveIn)) || tb[i];
    if (!o) return;
    const label = t.label || `임차인${i + 1}`;
    cmp(`${label} 전입일`, t.moveIn, o.moveIn);
    cmp(`${label} 확정일자`, t.fixedDate, o.fixedDate);
    cmp(`${label} 보증금`, t.deposit, o.deposit);
    cmp(`${label} 배당요구`, !!t.demanded, !!o.demanded);
  });
  const bad = rows.filter((r) => !r.ok);
  return { checkedAt: new Date().toISOString(), total: rows.length, mismatches: bad.length, ok: bad.length === 0, rows };
}

module.exports = { verify };
