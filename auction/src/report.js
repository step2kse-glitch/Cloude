// 평가된 케이스들 → 리포트 (Markdown + 핸드폰에서 보기 좋은 HTML)
const fs = require('fs');
const path = require('path');
const { won, eok, pct, toDate, ymd, addDays } = require('./lib/util');
const { affordableBid } = require('./calc');

const GRADE_ORDER = { A: 0, B: 1, C: 2, 보류: 3, X: 4 };
const GRADE_LABEL = { A: 'A 입찰 권장', B: 'B 조건부', C: 'C 관망', 보류: '보류', X: 'X 제외' };
const DISCLAIMER = '⚠ 공개 자료를 정리한 참고용이며 법률·세무 자문이 아닙니다. 금액·기간의 "추정"은 설정값 기반입니다. 입찰 전 원문 서류·현장·전문가 확인 필수.';

const table = (head, rows) => [`| ${head.join(' | ')} |`, `|${head.map(() => '---').join('|')}|`, ...rows.map((r) => `| ${r.map((x) => String(x ?? '-').replace(/\|/g, '/')).join(' | ')} |`)].join('\n');

function sortCases(cases) {
  return [...cases].sort((a, b) => {
    const g = GRADE_ORDER[a.result.grade] - GRADE_ORDER[b.result.grade];
    if (g) return g;
    const pa = a.result.calc.scenarios ? a.result.calc.scenarios.mid.profit : -Infinity;
    const pb = b.result.calc.scenarios ? b.result.calc.scenarios.mid.profit : -Infinity;
    return pb - pa;
  });
}

function roadmap(c, r) {
  const d = toDate(c.saleDate);
  if (!d) return ['매각기일 미확인 — 일정 계산 불가'];
  const ev = r.eviction;
  const pay = addDays(d, 45);
  const handover = addDays(pay, Math.round(ev.months * 30));
  const best = (r.strategy.options || []).find((o) => o.key === r.strategy.best);
  return [
    `${ymd(addDays(d, -14))} ~ ${ymd(addDays(d, -3))} 임장: 관리사무소(체납관리비)·전입세대열람·중개사 2곳(매매/전세/월세 시세)·대출 상담`,
    `${ymd(addDays(d, -1))} 변경·연기·취하 재확인, 매각물건명세서 최신본 확인`,
    `**${ymd(d)} 입찰** — 보증금 ${won(r.calc.deposit)} (자기앞수표), 신분증·도장 / 상한 ${won(r.calc.bids && r.calc.bids.ceiling)} 절대 넘기지 않기`,
    `${ymd(addDays(d, 7))} 매각허가결정 → ${ymd(addDays(d, 14))} 확정`,
    `~${ymd(pay)} 잔금 납부(추정, 법원 통지 기준) + 같은 날 **인도명령 신청** + 소유권이전등기·취득세`,
    `~${ymd(handover)} 명도 완료 목표 (${ev.type}, 약 ${ev.months}개월 추정)`,
    best ? `이후: ${best.name} 진행` : null,
  ].filter(Boolean);
}

function caseSection(c, r, n) {
  const a = r.analysis;
  const k = r.calc;
  const out = [];
  out.push(`### ${n}. ${c.caseNo} — ${GRADE_LABEL[r.grade]}`);
  out.push(`> ${r.reasons.join(' · ')}`);
  if (c._sample) out.push(`> 🧪 ${c._sample}`);
  out.push(
    [
      `- 법원: ${c.court || '-'} / 매각기일: **${c.saleDate || '❓'}**`,
      `- 물건: ${c.usage || '-'} ${c.areaM2 ? c.areaM2 + '㎡' : ''} · ${c.address || '-'}`,
      `- 감정가 ${won(c.appraisal)} (${c.appraisalDate || '감정일 ❓'}) → 최저가 **${won(c.minPrice)}** (${pct(k.minPriceRatio)}, 유찰 ${c.failCount ?? '?'}회)`,
      c.summary ? `- 한 줄 요약: ${c.summary}` : null,
    ]
      .filter(Boolean)
      .join('\n')
  );

  // 얼마를 넣어야 하나
  if (k.bids) {
    out.push('#### 💰 입찰가와 넣어야 할 돈');
    out.push(table(['구분', '금액', '설명'], [
      ['보수 입찰가', won(k.bids.conservative), '경쟁이 적어 보일 때'],
      ['**추천 입찰가**', `**${won(k.bids.recommended)}**`, `기준 시세에서 목표 마진 ${pct(k.margin)} 확보`],
      ['상한', won(k.bids.ceiling), '넘으면 이익이 목표 미만 — 현장에서 올리지 않기'],
      ['입찰보증금', won(k.deposit), '입찰 당일 필요 (낙찰 못 받으면 바로 돌려받음)'],
      ['잔금일 필요 현금', won(k.scenarios && k.scenarios.mid.cashNeeded), `대출 ${pct(r.settings.buyer.loanRatio)} 가정, 세금·이전비·인수금·명도·수리 포함`],
    ]));
    out.push(`시세 근거: 보수 ${eok(k.market.low)} · 기준 ${eok(k.market.mid)} · 낙관 ${eok(k.market.high)} — ${k.market.source || '❗출처 미기재'}`);
  } else {
    out.push(`#### 💰 입찰가\n${k.verdict}`);
  }

  // 권리분석
  out.push('#### ⚖️ 권리분석');
  out.push(`말소기준권리: ${a.baseRight ? `**${a.baseRight.type} ${a.baseRight.date}** ${a.baseRight.holder || ''}` : '❓ 미확정'}`);
  if (a.rights.length) out.push(table(['권리', '날짜', '권리자', '판정', '이유'], a.rights.map((x) => [x.type, x.date, x.holder, x.status === '인수' || x.status === '위험' ? `❗${x.status}` : x.status, x.reason])));
  if (c.spec) out.push(`- 명세서 "소멸되지 않는 권리": "${c.spec.notExtinguished || '-'}"\n- 명세서 비고: "${c.spec.remarks || '-'}"`);
  if (a.tenants.length) {
    out.push(table(['점유자', '전입', '확정일자', '배당요구', '보증금', '대항력', '예상 배당', '낙찰자 인수'], a.tenants.map((t) => [t.label, t.moveIn, t.fixedDate, t.demanded ? 'O' : 'X', won(t.deposit), t.opposable ? '❗있음' : '없음', won(t.distributed), t.assumed ? `❗${won(t.assumed)}` : '0'])));
    out.push(`<details><summary>배당 계산 (최저가 ${won(a.distribution.assumedPrice)} 낙찰 가정, 간이)</summary>\n\n${table(['순서', '금액'], a.distribution.log.map((l) => [l.step, won(l.amount)]))}\n\n</details>`);
  } else {
    out.push(`점유: ${c.occupant || (c.tenantsUnknown ? '❓ 미확인' : '임차인 없음')}`);
  }
  if (a.assumedAmount) out.push(`**낙찰자 인수 예상액**: 최저가 낙찰 시 ${won(a.assumedAmount)} → 추천가 낙찰 시 ${won(a.assumedAtRecommended)} (입찰가 계산에 낙찰가별로 반영)`);

  // 명도
  const ev = r.eviction;
  out.push('#### 🚪 명도 계획');
  out.push(`유형: **${ev.type}** · 예상 비용 ${won(ev.expectedCost)}${ev.estimatedUsed ? '(추정)' : ''} · 강제집행까지 가면 최대 ${won(ev.worstCost)} · 기간 약 ${ev.months}개월`);
  out.push(ev.steps.map((s, i) => `${i + 1}. ${s}`).join('\n'));

  // 출구 전략
  const st = r.strategy;
  if (st.options && st.options.length) {
    out.push('#### 🧭 어떻게 쓰는 게 나을까 (같은 추천 입찰가 기준)');
    out.push(table(['방법', '잔금일 넣을 돈', '최종 묶이는 돈', '기간', '예상 이익', '연수익률', '세금', '위험'], st.options.map((o) => [
      (o.key === st.best ? '⭐ ' : '') + o.name,
      won(o.initialCash),
      o.lockedCash < 0 ? `플피 ${won(-o.lockedCash)} 회수` : won(o.lockedCash),
      o.months ? `${o.months}개월` : '-',
      o.key === 'live' ? `${won(o.profit)} 절약` : won(o.profit),
      o.annualRoi === Infinity ? '무한(플피)' : o.annualRoi == null ? (o.monthlyCost ? `월 ${won(o.monthlyCost)} 부담` : '-') : pct(o.annualRoi),
      o.tax,
      o.risks.join(' / ') || '-',
    ])));
    const best = st.options.find((o) => o.key === st.best);
    if (best) out.push(`⭐ 추천: **${best.name}** — 목표 "${r.settings.goal || '상관없음'}" 기준${best.monthlyCashflow != null ? ` · 월 현금흐름 ${won(best.monthlyCashflow)}` : ''}${best.note ? ` · ${best.note}` : ''}`);
    if (st.missing.length) out.push(`ℹ ${st.missing.join('·')} 미확인 → 해당 방법은 비교에서 빠짐 (임장 때 중개사에게 확인)`);
  }

  // 실거주 적합도
  if (c.homeFit) {
    const h = c.homeFit;
    out.push('#### 🏠 내 집으로서');
    out.push(`- 출퇴근: ${h.commute || '❓'}\n- 학교: ${h.school || '❓'}\n- 생활: ${h.living || '❓'}\n- 적합도: ${h.score ? '★'.repeat(h.score) + '☆'.repeat(5 - h.score) : '❓'}`);
  }

  out.push('#### 📅 진행 로드맵');
  out.push(roadmap(c, r).map((x) => `- ${x}`).join('\n'));

  const qs = [...a.questions, ...(c.questions || [])];
  if (qs.length || a.warnings.length) {
    out.push('#### ❓ 확인 필요');
    out.push([...qs.map((q) => `- ❓ ${q}`), ...a.warnings.map((w) => `- ⚠ ${w}`)].join('\n'));
  }
  return out.join('\n\n');
}

function buildMarkdown(cases, criteria, meta = {}) {
  const sorted = sortCases(cases);
  const s = sorted[0] ? sorted[0].result.settings : { buyer: criteria.buyer || {} };
  const budget = criteria.cashAvailable ? affordableBid(criteria.cashAvailable, s) : null;
  const live = /실거주/.test(criteria.goal || '');
  const md = [];
  md.push(`# 법원경매 리포트 — ${meta.title || `${criteria.sigungu || criteria.sido || ''} ${criteria.usage || ''}`.trim()} (${ymd(new Date())})`);
  md.push(`> ${DISCLAIMER}`);
  md.push('## 1. 내 조건과 예산');
  md.push([
    `- 목표: **${criteria.goal || '상관없음'}** · 가용 현금 **${won(criteria.cashAvailable)}** · 대출 ${pct((criteria.buyer || {}).loanRatio)} · 낙찰 후 주택수 ${(criteria.buyer || {}).houseCountAfter ?? '?'}`,
    budget ? `- 이 현금으로 감당 가능한 최대 낙찰가 ≈ **${eok(budget)}** (세금·이전비·기본 명도/수리비 포함) → 최저가가 이보다 낮은 물건 위주로 보기` : null,
    live && criteria.home ? `- 집 고르는 기준: 직장 ${criteria.home.workplace || '❓'} · 출퇴근 ${criteria.home.commuteMaxMin}분 이내 · 학교 ${criteria.home.needSchool ? '필요' : '무관'} · 방 ${criteria.home.minRooms}개 이상 · 입주 희망 ${criteria.home.moveInBy || '❓'}` : null,
  ].filter(Boolean).join('\n'));

  md.push('## 2. 한눈에 보기');
  md.push(table(['순위', '등급', '사건번호', '물건', '최저가(%)', '매각기일', '추천 입찰가', '잔금일 현금', '추천 방법', '기준 이익'], sorted.map((x, i) => {
    const r = x.result;
    const best = (r.strategy.options || []).find((o) => o.key === r.strategy.best);
    return [i + 1, GRADE_LABEL[r.grade], x.caseNo, `${x.usage || ''} ${x.areaM2 || ''}㎡`, `${eok(x.minPrice)} (${pct(r.calc.minPriceRatio)})`, x.saleDate, won(r.calc.bids && r.calc.bids.recommended), won(r.calc.scenarios && r.calc.scenarios.mid.cashNeeded), best ? best.name : '-', won(r.calc.scenarios && r.calc.scenarios.mid.profit)];
  })));
  const counts = sorted.reduce((m, x) => ((m[x.result.grade] = (m[x.result.grade] || 0) + 1), m), {});
  md.push(`검토 ${sorted.length}건 → ${Object.entries(counts).map(([g, n]) => `${g} ${n}`).join(' · ')}`);
  const todo = sorted.filter((x) => ['A', 'B'].includes(x.result.grade) && x.saleDate).sort((a, b) => String(a.saleDate).localeCompare(String(b.saleDate)));
  if (todo.length) md.push('**다음 할 일**\n' + todo.map((x) => `- ${ymd(addDays(toDate(x.saleDate), -14))}까지 ${x.caseNo} 임장 → ${x.saleDate} 입찰 여부 결정`).join('\n'));

  if (live) {
    const homes = sorted.filter((x) => x.result.grade !== 'X' && x.homeFit);
    if (homes.length) {
      homes.sort((a, b) => (b.homeFit.score || 0) - (a.homeFit.score || 0));
      md.push('## 3. 내 집 후보 순위 (실거주 적합도 우선)');
      md.push(table(['순위', '사건번호', '적합도', '출퇴근', '학교', '급매 대비 절약', '입주 예상'], homes.map((x, i) => {
        const o = x.result.strategy.options.find((y) => y.key === 'live');
        const d = toDate(x.saleDate);
        return [i + 1, x.caseNo, x.homeFit.score ? '★'.repeat(x.homeFit.score) : '❓', x.homeFit.commute, x.homeFit.school, o ? won(o.profit) : '-', d ? ymd(addDays(d, 45 + Math.round(x.result.eviction.months * 30))) : '-'];
      })));
    }
  }

  md.push(`## ${live ? 4 : 3}. 물건별 분석`);
  const main = sorted.filter((x) => x.result.grade !== 'X');
  main.forEach((x, i) => md.push(caseSection(x, x.result, i + 1)));
  const ex = sorted.filter((x) => x.result.grade === 'X');
  if (ex.length) {
    md.push(`## ${live ? 5 : 4}. 제외 물건`);
    md.push(ex.map((x) => `- **${x.caseNo}** ${x.address || ''} — ${x.result.reasons.join(' · ')}`).join('\n'));
  }
  md.push('---\n' + DISCLAIMER);
  return md.join('\n\n') + '\n';
}

// 최소 Markdown → HTML (제목·표·목록·인용·굵게·details)
function toHtml(md, title) {
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const inline = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  const lines = md.split('\n');
  const html = [];
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (/^<\/?(details|summary)/.test(l)) {
      html.push(l.replace(/<summary>(.*)<\/summary>/, (_, t) => `<summary>${esc(t)}</summary>`));
    } else if (/^#{1,4} /.test(l)) {
      const n = l.match(/^#+/)[0].length;
      html.push(`<h${n}>${inline(l.slice(n + 1))}</h${n}>`);
    } else if (l.startsWith('|')) {
      const rows = [];
      while (i < lines.length && lines[i].startsWith('|')) rows.push(lines[i++]);
      i--;
      const cells = (r) => r.slice(1, -1).split(' | ').map((x) => x.trim());
      html.push('<div class="tw"><table><thead><tr>' + cells(rows[0]).map((c) => `<th>${inline(c)}</th>`).join('') + '</tr></thead><tbody>' + rows.slice(2).map((r) => '<tr>' + cells(r).map((c) => `<td>${inline(c)}</td>`).join('') + '</tr>').join('') + '</tbody></table></div>');
    } else if (/^(- |\d+\. )/.test(l)) {
      const ordered = /^\d+\. /.test(l);
      const items = [];
      while (i < lines.length && /^(- |\d+\. )/.test(lines[i])) items.push(lines[i++].replace(/^(- |\d+\. )/, ''));
      i--;
      html.push(`<${ordered ? 'ol' : 'ul'}>${items.map((x) => `<li>${inline(x)}</li>`).join('')}</${ordered ? 'ol' : 'ul'}>`);
    } else if (l.startsWith('> ')) {
      html.push(`<blockquote>${inline(l.slice(2))}</blockquote>`);
    } else if (l === '---') {
      html.push('<hr>');
    } else if (l.trim()) {
      html.push(`<p>${inline(l)}</p>`);
    }
  }
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title>
<style>
:root{--bg:#fafaf8;--fg:#1d1d1b;--mute:#6b6b66;--line:#e2e1dc;--card:#fff;--accent:#2f5d50;--warn:#9a3b1e}
@media (prefers-color-scheme:dark){:root{--bg:#161615;--fg:#ecebe6;--mute:#a3a29b;--line:#34332f;--card:#1f1f1d;--accent:#7fb8a6;--warn:#e39274}}
body{background:var(--bg);color:var(--fg);font:15px/1.65 -apple-system,"Apple SD Gothic Neo","Malgun Gothic",sans-serif;margin:0;padding:16px;max-width:1100px;margin:auto}
h1{font-size:22px}h2{font-size:19px;border-bottom:2px solid var(--accent);padding-bottom:4px;margin-top:36px}h3{font-size:17px;margin-top:32px;color:var(--accent)}h4{font-size:15px;margin:22px 0 6px}
blockquote{margin:8px 0;padding:8px 12px;border-left:3px solid var(--accent);background:var(--card);color:var(--mute)}
.tw{overflow-x:auto;-webkit-overflow-scrolling:touch}table{border-collapse:collapse;min-width:100%;background:var(--card);font-size:13.5px}
th,td{border:1px solid var(--line);padding:6px 8px;text-align:left;vertical-align:top;white-space:nowrap}td:last-child{white-space:normal;min-width:180px}
th{background:var(--bg)}details{margin:8px 0}summary{cursor:pointer;color:var(--mute)}strong{color:var(--fg)}
</style></head><body>${html.join('\n')}</body></html>`;
}

function writeReport(cases, criteria, outDir, meta = {}) {
  const md = buildMarkdown(cases, criteria, meta);
  const stamp = ymd(new Date()).replace(/-/g, '');
  const slug = (meta.slug || `${criteria.sigungu || criteria.sido || 'auction'}-${criteria.usage || ''}`).replace(/[\s/\\]+/g, '-').replace(/-+$/, '');
  fs.mkdirSync(outDir, { recursive: true });
  const base = path.join(outDir, `${stamp}-${slug}`);
  fs.writeFileSync(base + '.md', md);
  fs.writeFileSync(base + '.html', toHtml(md, `경매 리포트 ${stamp}`));
  return { md: base + '.md', html: base + '.html' };
}

module.exports = { buildMarkdown, writeReport, toHtml };
