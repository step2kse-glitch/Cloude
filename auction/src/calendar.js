// 입찰 캘린더: 물건별 일정(임장·D-1 확인·입찰·허가·확정·잔금 예정) + .ics 내보내기(구글·애플 캘린더에 가져오기)
const { toDate, ymd, addDays } = require('./lib/util');

function eventsFor(c) {
  const d = toDate(c.saleDate);
  if (!d) return [];
  const deposit = c.result && c.result.calc && c.result.calc.deposit;
  const ceiling = c.result && c.result.calc && c.result.calc.bids && c.result.calc.bids.ceiling;
  const base = { id: c._id || null, caseNo: c.caseNo, address: c.address, grade: c.result ? c.result.grade : null, watch: !!c.watch };
  const ev = [
    { ...base, date: ymd(addDays(d, -14)), kind: '임장', title: `임장 시작 ${c.caseNo}`, detail: '관리사무소(체납관리비)·전입세대열람·중개사 2곳(매매·전월세 시세)·대출 상담' },
    { ...base, date: ymd(addDays(d, -1)), kind: '확인', title: `입찰 전날 확인 ${c.caseNo}`, detail: '변경·연기·취하 여부, 매각물건명세서 최신본' },
    { ...base, date: ymd(d), kind: '입찰', title: `입찰 ${c.caseNo}`, detail: `보증금 ${deposit ? Math.round(deposit).toLocaleString() + '원' : '최저가 10%'} · 신분증·도장${ceiling ? ` · 상한 ${Math.round(ceiling).toLocaleString()}원` : ''}` },
  ];
  if (c.outcome && c.outcome.won) {
    ev.push(
      { ...base, date: ymd(addDays(d, 7)), kind: '허가', title: `매각허가결정 ${c.caseNo}`, detail: '불허가 사유 없는지 확인' },
      { ...base, date: ymd(addDays(d, 14)), kind: '확정', title: `매각허가 확정 ${c.caseNo}`, detail: '대금지급기한 통지 대기 · 대출 실행 준비' },
      { ...base, date: ymd(addDays(d, 45)), kind: '잔금', title: `잔금 예정 ${c.caseNo}`, detail: '잔금 납부 + 같은 날 인도명령 신청 + 소유권이전등기(추정일, 법원 통지 기준)' },
    );
  }
  return ev;
}

function upcoming(cases, { days = 14, from = new Date(), onlyWatched = false } = {}) {
  const start = ymd(from);
  const end = ymd(addDays(toDate(start), days));
  return cases
    .filter((c) => !onlyWatched || c.watch)
    .flatMap(eventsFor)
    .filter((e) => e.date >= start && e.date < end)
    .sort((a, b) => a.date.localeCompare(b.date));
}

const esc = (s) => String(s || '').replace(/([,;\\])/g, '\\$1').replace(/\n/g, '\\n');

function toIcs(cases, { onlyWatched = true } = {}) {
  const evs = cases.filter((c) => !onlyWatched || c.watch).flatMap(eventsFor);
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//auction-tool//KO', 'CALSCALE:GREGORIAN', 'X-WR-CALNAME:경매 일정'];
  for (const e of evs) {
    const day = e.date.replace(/-/g, '');
    const next = ymd(addDays(toDate(e.date), 1)).replace(/-/g, '');
    lines.push(
      'BEGIN:VEVENT',
      `UID:${e.caseNo.replace(/\W/g, '')}-${e.kind}-${day}@auction-tool`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${day}`,
      `DTEND;VALUE=DATE:${next}`,
      `SUMMARY:${esc(e.title)}`,
      `DESCRIPTION:${esc(`${e.detail}\n${e.address || ''}`)}`,
      'END:VEVENT',
    );
  }
  lines.push('END:VCALENDAR');
  return lines.join('\r\n') + '\r\n';
}

module.exports = { eventsFor, upcoming, toIcs };
