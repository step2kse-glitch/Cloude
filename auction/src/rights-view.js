// 권리관계를 사람이 읽기 쉽게: 쉽게 말하면(요약) · 날짜순 타임라인(말소기준 선) · 체크리스트 · 한 줄 라벨
// analyze.js 결과만 보여준다 (판정을 새로 하지 않음).
const { won, toDate, ymd, addDays } = require('./lib/util');

const who = (x) => `${x.type}${x.holder ? ` (${x.holder})` : ''}`;
const CLEAN_SPEC = /^(\s*|-|해당\s*사항\s*없음|없음)$/;

function label(c, a) {
  if (a.fatal || a.rights.some((r) => r.status === '인수')) return '❗인수 권리';
  if (a.rights.some((r) => r.status === '위험') || (c.flags || []).length) return '⚠ 위험 요소';
  if (a.tenants.some((t) => t.opposable)) return '🏠 대항력 임차인';
  if (c.tenantsUnknown || a.questions.length) return '❓ 확인 필요';
  return '✅ 깨끗';
}

function summary(c, a) {
  const gone = a.rights.filter((r) => r.status === '소멸' || r.status === '말소기준');
  const kept = a.rights.filter((r) => r.status === '인수');
  const risky = a.rights.filter((r) => r.status === '위험');
  const lines = [];
  lines.push(`- ✅ **낙찰되면 사라지는 권리 ${gone.length}개**: ${gone.map(who).join(', ') || '없음'}`);
  const keep = kept.map((r) => `${who(r)} — ${r.reason}`);
  for (const t of a.tenants) {
    if (t.assumed > 0) keep.push(`${t.label} 보증금 잔액 (최저가 낙찰 시 ${won(t.assumed)}${a.assumedAtRecommended != null ? `, 추천가 낙찰 시 ${won(a.assumedAtRecommended)}` : ''})`);
  }
  lines.push(`- ${keep.length ? '❗' : '✅'} **낙찰자가 떠안는 것**: ${keep.join(' / ') || '없음'}`);
  lines.push(`- ${risky.length ? '❗' : '✅'} **순위와 상관없이 위험한 권리**(유치권·법정지상권 등): ${risky.map(who).join(', ') || '신고 없음'}`);
  if (a.tenants.length) {
    for (const t of a.tenants) {
      const opp = t.opposable
        ? `말소기준보다 먼저 전입 → **대항력 있음**`
        : `말소기준 이후 전입 → 대항력 없음(보증금을 못 받아도 낙찰자 책임 없음, 명도 대상)`;
      const dem = t.demanded ? `배당요구 함 → 예상 배당 ${won(t.distributed)}(최저가 기준)` : '배당요구 안 함';
      lines.push(`- 🏠 **${t.label}** (보증금 ${won(t.deposit)}): ${opp} · ${dem}`);
    }
  } else {
    lines.push(`- 🏠 **사는 사람**: ${c.occupant || (c.tenantsUnknown ? '❓ 확인 안 됨 — 전입세대열람 필요' : '임차인 없음')}`);
  }
  return lines.join('\n');
}

function timeline(c, a) {
  const ev = [];
  const baseKey = a.baseRight ? `${a.baseRight.type}|${a.baseRight.date}` : null;
  a.rights.forEach((r) => {
    const d = toDate(r.date);
    const amt = r.amount ? ` ${won(r.amount)}` : '';
    let text;
    if (`${r.type}|${r.date}` === baseKey && r.status === '말소기준') text = `━━ ⚖️ **말소기준권리: ${who(r)}**${amt} ━━ 이 선 위는 떠안을 수 있고, 아래는 사라짐`;
    else if (r.status === '인수') text = `🔴 ${who(r)}${amt} → **인수** (${r.reason})`;
    else if (r.status === '위험') text = `🟠 ${who(r)}${amt} → **위험** (${r.reason})`;
    else if (r.status === '❓') text = `❓ ${who(r)}${amt} → 날짜 미확인`;
    else text = `⚪ ${who(r)}${amt} → 소멸`;
    ev.push({ d, text });
  });
  for (const t of a.tenants) {
    const mi = toDate(t.moveIn);
    const same = t.fixedDate && t.moveIn && ymd(toDate(t.fixedDate)) === ymd(mi);
    if (mi) {
      ev.push({
        d: mi,
        text: `${t.opposable ? '🏠❗' : '🏠'} ${t.label} 전입${same ? '+확정일자' : ''} (보증금 ${won(t.deposit)}) → ${t.opposable ? `대항력 있음(${ymd(addDays(mi, 1))} 0시부터)` : '대항력 없음'}`,
      });
    } else {
      ev.push({ d: null, text: `❓ ${t.label} 전입일 미확인` });
    }
    if (t.fixedDate && !same) ev.push({ d: toDate(t.fixedDate), text: `📝 ${t.label} 확정일자 (배당 순위 기준일 ${t.priorityDate || '-'})` });
  }
  if (c.distributionDeadline) ev.push({ d: toDate(c.distributionDeadline), text: '📌 배당요구종기 (이날까지 배당요구한 사람만 배당)' });
  if (c.saleDate) ev.push({ d: toDate(c.saleDate), text: '🔨 매각기일 (입찰일)' });
  ev.sort((x, y) => (x.d && y.d ? x.d - y.d : x.d ? -1 : 1));
  return ev.map((e) => `- ${e.d ? ymd(e.d) : '날짜 ❓'} ${e.text}`).join('\n');
}

function checklist(c, a) {
  const senior = a.rights.filter((r) => r.status === '인수');
  const risky = a.rights.filter((r) => r.status === '위험');
  const opp = a.tenants.filter((t) => t.opposable);
  const flags = c.flags || [];
  const spec = c.spec || {};
  const specText = [spec.notExtinguished, spec.remarks].filter((x) => x && !CLEAN_SPEC.test(x));
  const k = c.costs || {};
  const rows = [
    a.baseRight ? `✅ 말소기준권리 확인 — ${a.baseRight.type} ${a.baseRight.date}` : '❓ 말소기준권리 미확정 — 등기부 갑구·을구 다시 확인',
    senior.length ? `❗ 말소기준보다 앞선 권리 — ${senior.map(who).join(', ')}` : '✅ 말소기준보다 앞선 가처분·가등기·전세권 없음',
    risky.length ? `❗ 유치권·법정지상권 등 — ${risky.map(who).join(', ')}` : '✅ 유치권·법정지상권·분묘기지권 신고 없음',
    opp.length
      ? `${a.assumedAtRecommended === 0 ? '⚠' : '❗'} 대항력 임차인 ${opp.length}명 — 추천가 낙찰 시 떠안을 돈 ${won(a.assumedAtRecommended ?? a.assumedAmount)}`
      : '✅ 대항력 있는 임차인 없음',
    c.tenantsUnknown ? '❓ 점유자 미확인 — 주민센터 전입세대열람 필요' : '✅ 점유자 확인됨(명세서 기준)',
    flags.length ? `❗ 물건 자체 문제 — ${flags.join(', ')}` : '✅ 지분·대지권·토지별도등기·위반건축물 해당 없음',
    specText.length ? `❗ 명세서 특이사항 원문 확인 — "${specText.join(' / ')}"` : '✅ 명세서 "소멸되지 않는 권리"·비고 특이사항 없음',
    k.unpaidMgmtFee != null ? `✅ 체납관리비 반영 — ${won(k.unpaidMgmtFee)} (공용부분 승계)` : '❓ 체납관리비 — 임장 때 관리사무소 확인',
    '❓ 전입세대열람 — 임장 때 주민센터 (명세서에 없는 전입자 확인)',
  ];
  return rows.map((x) => `- ${x}`).join('\n');
}

function section(c, r) {
  const a = r.analysis;
  const out = [];
  out.push('#### ⚖️ 권리관계 한눈에');
  out.push('**쉽게 말하면**');
  out.push(summary(c, a));
  out.push('**날짜순 타임라인** (⚖️ 말소기준 선보다 위 = 떠안을 수 있음 · 아래 = 낙찰로 사라짐)');
  out.push(timeline(c, a));
  out.push('**권리 체크리스트**');
  out.push(checklist(c, a));
  if (c.spec) out.push(`📄 명세서 원문 — 소멸되지 않는 권리: "${c.spec.notExtinguished || '-'}" · 비고: "${c.spec.remarks || '-'}"`);
  return out.join('\n\n');
}

module.exports = { section, label, summary, timeline, checklist };
