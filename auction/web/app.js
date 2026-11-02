// 내 경매 비서 — 화면 (외부 라이브러리 없음). 서버: auction/src/server.js
'use strict';

// ---------- 공용 ----------
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const won = (n) => (n == null || !isFinite(n) ? '-' : Math.round(n).toLocaleString('ko-KR') + '원');
const eok = (n) => {
  if (n == null || !isFinite(n)) return '-';
  const neg = n < 0 ? '-' : '';
  n = Math.abs(n);
  const e = Math.floor(n / 1e8);
  const m = Math.round((n % 1e8) / 1e4);
  if (!e) return `${neg}${m.toLocaleString('ko-KR')}만`;
  return `${neg}${e}억${m ? ' ' + m.toLocaleString('ko-KR') + '만' : ''}`;
};
const pct = (r, d = 1) => (r == null || !isFinite(r) ? '-' : (r * 100).toFixed(d) + '%');
// "4억 9000만", "35,000만", "490000000" → 원
function parseMoney(v) {
  if (v == null) return null;
  const s = String(v).replace(/[,\s원]/g, '');
  if (!s) return null;
  let total = 0;
  let rest = s;
  const e = rest.match(/^([\d.]+)억/);
  if (e) {
    total += parseFloat(e[1]) * 1e8;
    rest = rest.slice(e[0].length);
  }
  const m = rest.match(/^([\d.]+)만/);
  if (m) {
    total += parseFloat(m[1]) * 1e4;
    rest = rest.slice(m[0].length);
  }
  if (rest) {
    const n = parseFloat(rest);
    if (isNaN(n)) return null;
    total += n;
  }
  return Math.round(total);
}
const moneyVal = (n) => (n == null ? '' : eok(n).replace(/ /g, ' '));

async function api(path, opts = {}) {
  const res = await fetch(path, { headers: { 'content-type': 'application/json' }, ...opts, body: opts.body ? JSON.stringify(opts.body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `오류 ${res.status}`);
  return data;
}

function toast(msg, ms = 2600) {
  const t = $('#toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => (t.hidden = true), ms);
}

function modal(html, onMount) {
  const m = $('#modal');
  $('#sheet').innerHTML = html;
  m.hidden = false;
  m.onclick = (e) => {
    if (e.target === m) closeModal(); // false 를 반환하면 클릭 기본동작(체크박스 등)이 취소되므로 블록으로
  };
  $$('[data-close]', m).forEach((b) => (b.onclick = closeModal));
  onMount && onMount($('#sheet'));
}
const closeModal = () => ($('#modal').hidden = true);

let S = null; // 서버 상태
async function load() {
  S = await api('/api/state');
  return S;
}

// ---------- 내비게이션 ----------
const NAV = [
  ['#/', '🏠', '홈'],
  ['#/list', '📋', '물건'],
  ['#/calendar', '📅', '일정'],
  ['#/lab', '🎯', '적중률'],
  ['#/content', '✍️', '콘텐츠'],
  ['#/jobs', '🤖', 'AI 작업'],
  ['#/settings', '⚙️', '설정'],
];
const TABBAR = ['#/', '#/list', '#/calendar', '#/content', '#/settings'];
function drawNav() {
  const cur = '#/' + (location.hash.slice(2).split('/')[0] || '');
  const on = (h) => (h === cur || (h === '#/' && cur === '#/') ? 'on' : '');
  $('#nav').innerHTML = NAV.map(([h, i, l]) => `<a href="${h}" class="${on(h)}">${i} ${l}</a>`).join('');
  $('#tabbar').innerHTML = NAV.filter(([h]) => TABBAR.includes(h)).map(([h, i, l]) => `<a href="${h}" class="${on(h)}"><span>${i}</span>${l}</a>`).join('');
}

// ---------- 조각 ----------
const gradeBadge = (g) => `<span class="grade ${esc(g)}">${esc(g)}</span>`;
const GRADE_TEXT = { A: '입찰 권장', B: '조건부', C: '관망', X: '제외', 보류: '자료 부족' };
const tagChips = (tags, max = 6) => (tags || []).slice(0, max).map((t) => `<span class="tag ${esc(t.level)}">#${esc(t.text)}</span>`).join('');
const ddayText = (d) => (d == null ? '' : d === 0 ? '오늘 입찰' : d > 0 ? `D-${d}` : `입찰 ${-d}일 지남`);

function caseCard(c) {
  return `<div class="card item">
    <div class="head">
      ${gradeBadge(c.grade)}
      <a href="#/case/${encodeURIComponent(c.id)}" style="flex:1;min-width:0;text-decoration:none;color:inherit">
        <div class="row between"><span class="t">${esc(c.caseNo)}${c.sample ? '<span class="sample">샘플</span>' : ''}</span><span class="dday">${ddayText(c.dday)}</span></div>
        <div class="addr">${esc(c.usage || '')} ${c.areaM2 ? esc(c.areaM2) + '㎡' : ''} · ${esc(c.address || '주소 미확인')}</div>
      </a>
      <button class="star ${c.watch ? 'on' : ''}" data-watch="${esc(c.id)}" title="관심물건">${c.watch ? '★' : '☆'}</button>
    </div>
    <div style="margin-top:6px">${c.rightsLabel ? `<span class="tag">${esc(c.rightsLabel)}</span>` : ''}${tagChips(c.tags, 5)}</div>
    <a class="nums" href="#/case/${encodeURIComponent(c.id)}" style="text-decoration:none;color:inherit">
      <div><small>최저가</small><b>${eok(c.minPrice)}</b> <small>${pct(c.minPriceRatio, 0)}</small></div>
      <div><small>${c.grade === 'X' ? '판정' : '추천 입찰가'}</small><b>${c.grade === 'X' ? '입찰 비추천' : eok(c.recommended)}</b></div>
      <div><small>낙찰 가능성</small>${c.chance ? `<span class="pill ${esc(c.chance)}">${esc(c.chance)}</span>` : '<b>-</b>'}</div>
    </a>
  </div>`;
}

function bindStars(root) {
  $$('[data-watch]', root).forEach(
    (b) =>
      (b.onclick = async (e) => {
        e.preventDefault();
        await api(`/api/case/${encodeURIComponent(b.dataset.watch)}/watch`, { method: 'POST', body: {} });
        await load();
        toast(b.classList.contains('on') ? '관심물건에서 뺐어요' : '관심물건에 담았어요 — 일정이 캘린더에 들어가요');
        render();
      }),
  );
}

// ---------- 공통 동작 (모달) ----------
function openSearch() {
  const c = S.criteria;
  modal(
    `<h3>🔎 AI로 물건 찾기</h3>
    <p class="sub">원하는 조건을 말로 적어 주세요. AI가 법원경매 사이트를 돌며 물건을 모으고 분석해요.</p>
    <div class="field"><label>조건</label><input id="q" placeholder="예: 화성 아파트 5억 이하 투자" value="${esc([c.sigungu, c.usage, c.maxMinPrice ? eok(c.maxMinPrice) + ' 이하' : '', c.goal].filter(Boolean).join(' '))}"></div>
    ${S.recipeVerified ? '' : '<p class="warnbox">처음 한 번은 크롬 창이 뜨면 <b>직접 검색하고 관심 물건 상세 화면을 열어 주세요</b>. 다 보면 크롬을 닫으면 돼요. 다음부터는 AI가 혼자 돌아요.</p>'}
    <div class="row" style="margin-top:12px"><button class="btn primary" id="go">AI에게 맡기기</button><button class="btn" data-close>취소</button></div>`,
    (el) =>
      ($('#go', el).onclick = async () => {
        const job = await api('/api/jobs', { method: 'POST', body: { kind: 'search', text: $('#q', el).value } });
        closeModal();
        afterJob(job);
      }),
  );
}

function openAdd() {
  modal(
    `<h3>➕ 사건번호로 추가</h3>
    <p class="sub">관심 있는 사건번호를 넣으면 AI가 서류를 읽고 분석해요.</p>
    <div class="field"><label>사건번호</label><input id="no" placeholder="예: 2026타경12345"></div>
    <div class="field"><label>법원 (선택)</label><input id="court" placeholder="예: 수원지방법원"></div>
    <label class="check"><input type="checkbox" id="run" checked> 추가하고 바로 AI 분석 시작</label>
    <div class="row" style="margin-top:12px"><button class="btn primary" id="go">추가</button><button class="btn" data-close>취소</button></div>`,
    (el) =>
      ($('#go', el).onclick = async () => {
        try {
          const caseNo = $('#no', el).value.trim();
          const r = await api('/api/case', { method: 'POST', body: { caseNo, court: $('#court', el).value.trim() } });
          closeModal();
          await load();
          if ($('#run', el).checked) afterJob(await api('/api/jobs', { method: 'POST', body: { kind: 'analyze', caseNo } }));
          location.hash = `#/case/${encodeURIComponent(r.id)}`;
        } catch (e) {
          toast(e.message);
        }
      }),
  );
}

async function makeReport() {
  try {
    toast('리포트 만드는 중…');
    const r = await api('/api/report', { method: 'POST', body: {} });
    window.open(r.url, '_blank');
  } catch (e) {
    toast(e.message);
  }
}

async function samples(action) {
  await api('/api/samples', { method: 'POST', body: { action } });
  await load();
  toast(action === 'clear' ? '샘플을 지웠어요' : '샘플 물건 6건을 불러왔어요 (가상 데이터)');
  render();
}

function afterJob(job) {
  if (job.status === 'manual') {
    modal(`<h3>Claude Code에서 실행해 주세요</h3><pre class="log">${esc(job.log)}</pre><button class="btn" data-close>닫기</button>`);
    return;
  }
  if (job.status === 'failed') return toast(job.log || '작업을 시작하지 못했어요');
  toast('AI 작업을 시작했어요 — 🤖 AI 작업 화면에서 진행 상황을 볼 수 있어요', 3500);
  watchJob(job.id);
}

const watching = new Set();
function watchJob(id) {
  if (watching.has(id)) return;
  watching.add(id);
  const tick = async () => {
    const j = await api(`/api/jobs/${id}`).catch(() => null);
    if (!j || j.status === 'running') return setTimeout(tick, 3000);
    watching.delete(id);
    await load();
    toast(j.status === 'done' ? '✅ AI 작업이 끝났어요' : '❌ AI 작업이 실패했어요 — AI 작업 화면에서 기록을 확인하세요', 4000);
    render();
  };
  setTimeout(tick, 3000);
}

// ---------- 홈 ----------
function viewHome() {
  const c = S.criteria;
  const cases = S.cases;
  const watched = cases.filter((x) => x.watch);
  const counts = cases.reduce((m, x) => ((m[x.grade] = (m[x.grade] || 0) + 1), m), {});
  const st = S.stats;
  const hasSample = cases.some((x) => x.sample);

  const onboarding = !cases.length
    ? `<div class="card" style="margin-bottom:14px">
        <h2 style="margin-top:0">처음 오셨군요 👋</h2>
        <ol class="steps">
          <li><div><b>내 조건 정하기</b><br><span class="sub">목적·현금·대출을 넣으면 입찰가와 세금이 내 상황에 맞춰져요</span><br><a class="btn sm" href="#/settings">설정 열기</a></div></li>
          <li><div><b>샘플로 구경하기</b><br><span class="sub">가상 물건 6건으로 화면을 먼저 둘러보세요</span><br><button class="btn sm" data-act="samples">샘플 불러오기</button></div></li>
          <li><div><b>진짜 물건 찾기</b><br><span class="sub">조건을 말하면 AI가 법원경매 사이트를 돌며 정리해요</span><br><button class="btn sm primary" data-act="search">AI로 물건 찾기</button></div></li>
        </ol>
      </div>`
    : '';

  // 2주 일정 띠
  const start = new Date(S.today);
  const days = [...Array(14)].map((_, i) => {
    const d = new Date(start.getTime() + i * 86400000);
    const key = d.toISOString().slice(0, 10);
    const ev = S.upcoming.filter((e) => e.date === key);
    return { d, key, ev };
  });
  const dayName = ['일', '월', '화', '수', '목', '금', '토'];

  return `
  <h1>안녕하세요 😊</h1>
  <p class="sub">${esc(S.today)} · 목표 <b>${esc(c.goal || '상관없음')}</b> · ${esc([c.sigungu || c.sido, c.usage].filter(Boolean).join(' '))} <a href="#/settings">바꾸기</a></p>
  ${onboarding}
  <div class="grid g4">
    <div class="card kpi"><div class="l">내 현금으로 가능한 최대 낙찰가</div><div class="v">${eok(S.budget)}</div><div class="l">현금 ${eok(c.cashAvailable)} · 대출 ${pct(c.buyer && c.buyer.loanRatio, 0)}</div></div>
    <div class="card kpi"><div class="l">관심물건</div><div class="v">${watched.length}건</div><div class="l">전체 ${cases.length}건</div></div>
    <div class="card kpi"><div class="l">2주 안 입찰</div><div class="v">${S.upcoming.filter((e) => e.kind === '입찰').length}건</div><div class="l">임장·확인 일정 포함 ${S.upcoming.length}개</div></div>
    <div class="card kpi"><div class="l">내 추천가 적중률(±10%)</div><div class="v">${st.n ? pct(st.within10 / st.n, 0) : '-'}</div><div class="l">낙찰 결과 ${st.n}건 기준</div></div>
  </div>

  <h2>빠른 작업</h2>
  <div class="actions">
    <button class="action" data-act="search"><span class="ic">🔎</span><b>AI로 물건 찾기</b><small>조건만 말하면 순회·분석</small></button>
    <button class="action" data-act="add"><span class="ic">➕</span><b>사건번호로 추가</b><small>관심 물건 바로 분석</small></button>
    <button class="action" data-act="report"><span class="ic">📄</span><b>리포트 만들기</b><small>인쇄·공유용 한 장</small></button>
    <button class="action" data-act="${hasSample ? 'clear' : 'samples'}"><span class="ic">🧪</span><b>${hasSample ? '샘플 지우기' : '샘플로 체험'}</b><small>${hasSample ? '가상 물건 정리' : '가상 물건 6건'}</small></button>
  </div>

  <h2>앞으로 2주 <a class="btn sm" href="#/calendar" style="float:right">전체 일정</a></h2>
  <div class="week">${days.slice(0, 7).map(({ d, key, ev }) => `<div class="${ev.length ? 'has' : ''} ${key === S.today ? 'today' : ''}">${dayName[d.getDay()]}<b>${d.getDate()}</b>${ev.length ? ev.length + '건' : '—'}</div>`).join('')}</div>
  <div class="week" style="margin-top:4px">${days.slice(7).map(({ d, ev }) => `<div class="${ev.length ? 'has' : ''}">${dayName[d.getDay()]}<b>${d.getDate()}</b>${ev.length ? ev.length + '건' : '—'}</div>`).join('')}</div>
  <div class="card evlist" style="margin-top:10px">${
    S.upcoming.length
      ? S.upcoming
          .slice(0, 6)
          .map((e) => `<a class="e" href="#/case/${encodeURIComponent(e.id || e.caseNo.replace(/[^\w가-힣-]/g, '_'))}" style="text-decoration:none;color:inherit"><div class="d">${e.date.slice(5)}</div><div><b>${esc(e.kind)}</b> ${esc(e.caseNo)}<small>${esc(e.detail)}</small></div></a>`)
          .join('')
      : '<div class="empty">2주 안에 잡힌 일정이 없어요</div>'
  }</div>

  <h2>⭐ 관심물건</h2>
  ${watched.length ? `<div class="grid g2">${watched.map(caseCard).join('')}</div>` : '<div class="card empty">물건 목록에서 ☆를 누르면 여기에 모여요</div>'}

  ${
    cases.length
      ? `<h2>등급 분포</h2><div class="card">${['A', 'B', 'C', '보류', 'X']
          .map((g) => `<div class="row" style="margin:6px 0">${gradeBadge(g)}<span style="width:70px">${GRADE_TEXT[g]}</span><div class="bar" style="flex:1"><i style="width:${cases.length ? ((counts[g] || 0) / cases.length) * 100 : 0}%"></i></div><b style="width:36px;text-align:right">${counts[g] || 0}</b></div>`)
          .join('')}</div>`
      : ''
  }
  <div class="actions" style="margin-top:14px">
    <a class="action" href="#/lab"><span class="ic">🎯</span><b>적중률 보기</b><small>내 추천가가 맞았는지</small></a>
    <a class="action" href="#/jobs"><span class="ic">🤖</span><b>AI 작업</b><small>${S.claude ? '진행 상황·기록' : 'Claude Code 연결 필요'}</small></a>
  </div>
  <p class="disclaimer">공개 자료를 정리한 참고용이며 법률·세무 자문이 아니에요. 입찰 전 원문 서류·현장·전문가 확인은 필수예요.</p>`;
}

function bindActions(root) {
  $$('[data-act]', root).forEach(
    (b) =>
      (b.onclick = () =>
        ({
          search: openSearch,
          add: openAdd,
          report: makeReport,
          samples: () => samples('load'),
          clear: () => samples('clear'),
        })[b.dataset.act]()),
  );
}

// ---------- 물건 목록 ----------
const listState = { filter: '전체', q: '', sort: 'grade' };
function viewList() {
  const F = ['전체', '관심', 'A', 'B', 'C', '보류', 'X'];
  let xs = S.cases.slice();
  const f = listState.filter;
  if (f === '관심') xs = xs.filter((x) => x.watch);
  else if (f !== '전체') xs = xs.filter((x) => x.grade === f);
  const q = listState.q.trim();
  if (q) xs = xs.filter((x) => [x.caseNo, x.address, x.usage, ...(x.tags || []).map((t) => t.text)].join(' ').includes(q.replace(/^#/, '')));
  const G = { A: 0, B: 1, C: 2, 보류: 3, X: 4 };
  const sorters = {
    grade: (a, b) => G[a.grade] - G[b.grade] || (b.profit || 0) - (a.profit || 0),
    date: (a, b) => String(a.saleDate || '9').localeCompare(String(b.saleDate || '9')),
    price: (a, b) => (a.minPrice || 0) - (b.minPrice || 0),
    profit: (a, b) => (b.profit || -1e18) - (a.profit || -1e18),
  };
  xs.sort(sorters[listState.sort]);
  return `
  <div class="row between"><h1>물건</h1><div class="row"><button class="btn sm" data-act="add">➕ 추가</button><button class="btn sm primary" data-act="search">🔎 AI로 찾기</button></div></div>
  <input class="search" id="q" placeholder="사건번호·주소·태그 검색 (예: 대항력)" value="${esc(listState.q)}">
  <div class="chips">${F.map((x) => `<button class="chip ${x === f ? 'on' : ''}" data-f="${x}">${x === '전체' || x === '관심' ? x : x + ' ' + GRADE_TEXT[x]}</button>`).join('')}</div>
  <div class="row between" style="margin-bottom:8px"><span class="sub" style="margin:0">${xs.length}건</span>
    <select id="sort" class="btn sm">${[['grade', '등급순'], ['date', '입찰일순'], ['price', '최저가 낮은순'], ['profit', '예상 이익순']].map(([k, l]) => `<option value="${k}" ${listState.sort === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
  ${xs.length ? `<div class="grid g2">${xs.map(caseCard).join('')}</div>` : `<div class="card empty"><div class="big">📭</div>${S.cases.length ? '조건에 맞는 물건이 없어요' : '아직 물건이 없어요. AI로 찾거나 샘플로 체험해 보세요.'}<div class="row" style="justify-content:center;margin-top:10px"><button class="btn primary" data-act="search">AI로 물건 찾기</button>${S.cases.length ? '' : '<button class="btn" data-act="samples">샘플 불러오기</button>'}</div></div>`}`;
}
function bindList(root) {
  $('#q', root).oninput = (e) => {
    listState.q = e.target.value;
    const pos = e.target.selectionStart;
    render();
    const el = $('#q');
    el.focus();
    el.setSelectionRange(pos, pos);
  };
  $$('[data-f]', root).forEach((b) => (b.onclick = () => ((listState.filter = b.dataset.f), render())));
  $('#sort', root).onchange = (e) => ((listState.sort = e.target.value), render());
}

// ---------- 물건 상세 ----------
const TAB_DEFS = [
  ['요약', null],
  ['권리관계', '⚖️'],
  ['입찰가·돈', '💰'],
  ['경쟁', '🏁'],
  ['명도', '🚪'],
  ['활용법', '🧭'],
  ['내 집', '🏠'],
  ['일정', '📅'],
  ['확인할 것', '❓'],
  ['교차검증', '🔍'],
  ['기록하기', 'form'],
  ['고급', 'raw'],
];
let detailTab = '요약';
let detail = null;

async function viewCase(id) {
  detail = await api(`/api/case/${encodeURIComponent(id)}`);
  const { case: c, summary: s, sections } = detail;
  const secByIcon = (icon) => Object.entries(sections).find(([k]) => k.startsWith(icon));
  const tabs = TAB_DEFS.filter(([, icon]) => !icon || icon === 'form' || icon === 'raw' || secByIcon(icon));
  if (!tabs.find(([n]) => n === detailTab)) detailTab = '요약';
  const pane = (() => {
    const def = tabs.find(([n]) => n === detailTab);
    if (def[1] === 'form') return formPane(c);
    if (def[1] === 'raw') return rawPane(c);
    if (!def[1]) return summaryPane(c, s, sections);
    const [title, html] = secByIcon(def[1]);
    return `<h3>${esc(title)}</h3>${html}`;
  })();
  return `
  <a href="#/list" class="sub" style="text-decoration:none">← 물건 목록</a>
  <div class="card" style="margin-top:6px">
    <div class="row between" style="align-items:flex-start">
      <div class="row" style="align-items:flex-start;flex-wrap:nowrap">${gradeBadge(s.grade)}<div><h1 style="margin:0">${esc(c.caseNo)}${s.sample ? '<span class="sample">샘플</span>' : ''}</h1><div class="sub" style="margin:0">${esc(c.court || '')} · ${esc(c.usage || '')} ${c.areaM2 ? esc(c.areaM2) + '㎡' : ''}</div></div></div>
      <button class="star ${s.watch ? 'on' : ''}" data-watch="${esc(s.id)}">${s.watch ? '★' : '☆'}</button>
    </div>
    <div class="addr" style="margin:6px 0">${esc(c.address || '주소 미확인')}</div>
    <div>${s.rightsLabel ? `<span class="tag">${esc(s.rightsLabel)}</span>` : ''}${tagChips(s.tags, 12)}</div>
    <p style="margin:8px 0 0"><b>${esc(GRADE_TEXT[s.grade] || '')}</b> — ${esc(s.reasons.join(' · '))}</p>
    <div class="row" style="margin-top:10px">
      <button class="btn sm" data-job="analyze">🤖 AI 재분석</button>
      <button class="btn sm" data-job="verify">🔍 교차검증</button>
      <a class="btn sm" href="#/content/${encodeURIComponent(s.id)}">✍️ 콘텐츠</a>
      <span class="dday" style="margin-left:auto">${ddayText(s.dday)}</span>
    </div>
  </div>
  <div class="tabs">${tabs.map(([n]) => `<button class="${n === detailTab ? 'on' : ''}" data-tab="${n}">${n}</button>`).join('')}</div>
  <div class="pane">${pane}</div>`;
}

function summaryPane(c, s, sections) {
  const k = (c.result && c.result.calc) || {};
  const comp = c.result && c.result.competition;
  const best = c.result && c.result.strategy && (c.result.strategy.options || []).find((o) => o.key === c.result.strategy.best);
  const rights = Object.entries(sections).find(([t]) => t.startsWith('⚖️'));
  const rightsSummary = rights ? rights[1].split('<p><strong>날짜순')[0] : '';
  return `
  <div class="grid g3">
    <div class="card kpi"><div class="l">최저가 (감정가 대비)</div><div class="v">${eok(c.minPrice)}</div><div class="l">감정가 ${eok(c.appraisal)} · ${pct(s.minPriceRatio, 0)} · 유찰 ${esc(c.failCount ?? '?')}회</div></div>
    <div class="card kpi"><div class="l">${s.grade === 'X' ? '판정' : '추천 입찰가 / 상한'}</div><div class="v">${s.grade === 'X' ? '입찰 비추천' : eok(s.recommended)}</div><div class="l">${s.grade === 'X' ? esc(s.reasons[0] || '') : `상한 ${eok(s.ceiling)} 넘으면 포기`}</div></div>
    <div class="card kpi"><div class="l">잔금일 필요 현금</div><div class="v">${eok(s.cashNeeded)}</div><div class="l">입찰 당일 보증금 ${eok(k.deposit)}</div></div>
  </div>
  <div class="grid g2" style="margin-top:12px">
    <div class="card kpi"><div class="l">낙찰 가능성</div><div class="v">${comp && comp.chance ? `<span class="pill ${esc(comp.chance)}" style="font-size:18px">${esc(comp.chance)}</span>` : '-'}</div><div class="l">${esc(comp ? comp.advice || comp.note || '' : '')}</div></div>
    <div class="card kpi"><div class="l">추천 활용법</div><div class="v" style="font-size:19px">${esc(best ? best.name : '-')}</div><div class="l">${best ? (best.key === 'live' ? `급매보다 ${eok(best.profit)} 절약` : `예상 이익 ${eok(best.profit)}`) : '시세 확인 후 계산'}</div></div>
  </div>
  <h3>권리관계 요약</h3>
  <div class="card">${rightsSummary || '<span class="sub">서류 정리 전이에요 — AI 재분석을 눌러 주세요</span>'}<a href="#" data-tab="권리관계">타임라인·체크리스트 자세히 →</a></div>
  ${sections['기본'] ? `<h3>기본 정보</h3><div class="card">${sections['기본']}</div>` : ''}
  ${c.memo ? `<h3>내 메모</h3><div class="card" style="white-space:pre-wrap">${esc(c.memo)}</div>` : ''}`;
}

const mInput = (name, label, val, hint = '예: 4억 9000만') => `<div class="field"><label>${label}</label><input name="${name}" data-money value="${esc(moneyVal(val))}" placeholder="${hint}" inputmode="text"></div>`;
const tInput = (name, label, val, hint = '') => `<div class="field"><label>${label}</label><input name="${name}" value="${esc(val ?? '')}" placeholder="${esc(hint)}"></div>`;

function formPane(c) {
  const mp = c.marketPrice || {};
  const rm = c.rentMarket || {};
  const k = c.costs || {};
  const h = c.homeFit || {};
  const o = c.outcome || {};
  const comps = c.auctionComps || [];
  return `
  <p class="note">임장·중개사·대출 상담에서 알게 된 걸 적으면 입찰가와 추천이 바로 다시 계산돼요. 금액은 "4억 9000만"처럼 써도 돼요.</p>
  <form class="card" data-form="market"><h3 style="margin-top:0">📈 매매 시세</h3>
    <div class="grid g3">${mInput('low', '보수 (급매·하위 실거래)', mp.low)}${mInput('mid', '기준 (실거래 중간)', mp.mid)}${mInput('high', '낙관 (최고 실거래)', mp.high)}</div>
    ${tInput('source', '출처 (필수)', mp.source, '예: 국토부 실거래 최근 6개월 3건, 11/2 조회')}
    <button class="btn primary">시세 저장</button></form>
  <form class="card" data-form="rent" style="margin-top:12px"><h3 style="margin-top:0">🏘 전월세 시세</h3>
    <div class="grid g3">${mInput('jeonse', '전세', rm.jeonse)}${mInput('monthlyDeposit', '월세 보증금', rm.monthlyDeposit, '예: 3000만')}${mInput('monthlyRent', '월세', rm.monthlyRent, '예: 120만')}</div>
    ${tInput('source', '출처', rm.source, '예: 단지 앞 중개사 2곳')}
    <button class="btn primary">전월세 저장</button></form>
  <form class="card" data-form="costs" style="margin-top:12px"><h3 style="margin-top:0">🧾 비용</h3>
    <div class="grid g2">${mInput('unpaidMgmtFee', '체납관리비 (공용부분)', k.unpaidMgmtFee, '예: 120만')}${mInput('repairCost', '수리비', k.repairCost, '예: 1000만')}${mInput('evictionCost', '명도비 (비우면 자동 추정)', k.evictionCost, '예: 300만')}${mInput('monthlyHoldingCost', '월 보유비 (관리비·보유세)', k.monthlyHoldingCost, '예: 30만')}</div>
    <button class="btn primary">비용 저장</button></form>
  <form class="card" data-form="home" style="margin-top:12px"><h3 style="margin-top:0">🏠 내 집으로서 (실거주)</h3>
    ${tInput('commute', '출퇴근', h.commute, '예: 동탄역까지 버스 15분')}${tInput('school', '학교', h.school, '예: 초등학교 도보 7분')}${tInput('living', '생활', h.living, '예: 마트·병원 도보권')}
    <div class="field"><label>적합도</label><select name="score">${['', 1, 2, 3, 4, 5].map((n) => `<option value="${n}" ${String(h.score ?? '') === String(n) ? 'selected' : ''}>${n ? '★'.repeat(n) : '선택'}</option>`).join('')}</select></div>
    <button class="btn primary">저장</button></form>
  <form class="card" data-form="comp" style="margin-top:12px"><h3 style="margin-top:0">🏁 비슷한 물건 낙찰 사례 (${comps.length}건)</h3>
    ${comps.length ? `<div class="tw"><table><tr><th>사례</th><th>날짜</th><th>낙찰가율</th><th>입찰자</th><th></th></tr>${comps.map((x, i) => `<tr><td>${esc(x.caseNo || '-')}</td><td>${esc(x.date || '-')}</td><td>${x.appraisal ? pct(x.winningBid / x.appraisal) : '-'}</td><td>${esc(x.bidders ?? '-')}</td><td><button type="button" class="btn sm danger" data-delcomp="${i}">삭제</button></td></tr>`).join('')}</table></div>` : '<p class="sub">같은 단지·인근의 최근 낙찰 사례를 넣으면 "낙찰 가능성"이 계산돼요.</p>'}
    <div class="grid g3">${tInput('caseNo', '사건번호', '', '예: 2025타경1234')}${tInput('date', '낙찰일', '', '예: 2026-09-15')}${tInput('bidders', '입찰자 수', '', '예: 7')}${mInput('appraisal', '감정가', null)}${mInput('winningBid', '낙찰가', null)}${tInput('source', '출처', '', '예: 법원경매정보 매각결과')}</div>
    <button class="btn primary">사례 추가</button></form>
  <form class="card" data-form="outcome" style="margin-top:12px"><h3 style="margin-top:0">🔨 입찰 결과 기록</h3>
    <p class="sub">입찰일이 지나면 결과를 적어 두세요. 내 추천가 적중률(🎯)이 쌓여요.</p>
    <div class="grid g3"><div class="field"><label>결과</label><select name="result">${['', '낙찰', '유찰', '변경', '취하'].map((x) => `<option ${o.result === x ? 'selected' : ''} value="${x}">${x || '선택'}</option>`).join('')}</select></div>
    ${mInput('winningBid', '낙찰가', o.winningBid)}${tInput('bidders', '입찰자 수', o.bidders)}${tInput('date', '날짜', o.date || c.saleDate)}${mInput('myBid', '내가 쓴 금액 (입찰했다면)', o.myBid)}</div>
    <label class="check"><input type="checkbox" name="won" ${o.won ? 'checked' : ''}> 내가 낙찰받았어요 (낙찰 후 일정이 캘린더에 추가돼요)</label>
    <button class="btn primary">결과 저장</button></form>
  <form class="card" data-form="memo" style="margin-top:12px"><h3 style="margin-top:0">📝 임장 메모</h3>
    <div class="field"><textarea name="memo" placeholder="본 것·들은 것을 자유롭게 (예: 1층 누수 흔적, 관리실 말로는 체납 120만, 중개사 급매 4.6억)" style="font-family:inherit">${esc(c.memo || '')}</textarea></div>
    <div class="row"><button class="btn primary">메모 저장</button><button type="button" class="btn" data-memojob>🤖 메모를 AI가 읽고 반영</button></div></form>`;
}

function rawPane(c) {
  const { result, _id, ...data } = c;
  return `<p class="warnbox">AI가 서류에서 옮긴 원본 데이터예요. 틀린 사실을 직접 고칠 때만 쓰세요. (저장하면 바로 다시 계산돼요)</p>
  <form data-form="raw"><div class="field"><textarea name="json" style="min-height:420px">${esc(JSON.stringify(data, null, 2))}</textarea></div>
  <div class="row"><button class="btn primary">저장</button><button type="button" class="btn danger" data-delcase>이 물건 삭제</button></div></form>`;
}

function bindCase(root) {
  const id = detail.summary.id;
  const c = detail.case;
  $$('[data-tab]', root).forEach(
    (b) =>
      (b.onclick = (e) => {
        e.preventDefault();
        detailTab = b.dataset.tab;
        render();
      }),
  );
  $$('[data-job]', root).forEach(
    (b) => (b.onclick = async () => afterJob(await api('/api/jobs', { method: 'POST', body: { kind: b.dataset.job, caseNo: c.caseNo } }))),
  );
  const post = async (path, body, msg) => {
    try {
      await api(`/api/case/${encodeURIComponent(id)}/${path}`, { method: 'POST', body });
      await load();
      toast(msg || '저장했어요 — 다시 계산했어요');
      render();
    } catch (e) {
      toast(e.message);
    }
  };
  const vals = (f) => {
    const o = {};
    for (const el of $$('input,select,textarea', f)) {
      if (!el.name) continue;
      if (el.type === 'checkbox') o[el.name] = el.checked;
      else if (el.dataset.money !== undefined) o[el.name] = parseMoney(el.value);
      else o[el.name] = el.value.trim() || null;
    }
    return o;
  };
  $$('form[data-form]', root).forEach((f) => {
    f.onsubmit = async (e) => {
      e.preventDefault();
      const v = vals(f);
      const kind = f.dataset.form;
      if (kind === 'market') {
        if (v.mid && !v.source) return toast('시세 출처를 적어 주세요 (지어낸 숫자 방지)');
        return post('update', { marketPrice: v });
      }
      if (kind === 'rent') return post('update', { rentMarket: v });
      if (kind === 'costs') return post('update', { costs: v });
      if (kind === 'home') return post('update', { homeFit: { ...v, score: v.score ? Number(v.score) : null } });
      if (kind === 'memo') return post('update', { memo: v.memo });
      if (kind === 'comp') {
        if (!v.appraisal || !v.winningBid) return toast('감정가와 낙찰가를 넣어 주세요');
        const list = [...(c.auctionComps || []), { ...v, bidders: v.bidders ? Number(v.bidders) : null }];
        return post('update', { auctionComps: list }, '낙찰 사례를 추가했어요');
      }
      if (kind === 'outcome') return post('outcome', { outcome: v.result ? { ...v, bidders: v.bidders ? Number(v.bidders) : null } : null }, '결과를 기록했어요');
      if (kind === 'raw') {
        try {
          return post('raw', { case: JSON.parse(v.json) });
        } catch {
          return toast('JSON 형식이 올바르지 않아요');
        }
      }
    };
  });
  $$('[data-delcomp]', root).forEach(
    (b) =>
      (b.onclick = () => {
        const list = (c.auctionComps || []).filter((_, i) => i !== Number(b.dataset.delcomp));
        post('update', { auctionComps: list }, '삭제했어요');
      }),
  );
  const mj = $('[data-memojob]', root);
  if (mj)
    mj.onclick = async () => {
      const memo = $('textarea[name=memo]', root).value;
      await api(`/api/case/${encodeURIComponent(id)}/update`, { method: 'POST', body: { memo } });
      afterJob(await api('/api/jobs', { method: 'POST', body: { kind: 'update', caseNo: c.caseNo, text: memo } }));
    };
  const del = $('[data-delcase]', root);
  if (del)
    del.onclick = async () => {
      if (!confirm(`${c.caseNo} 를 삭제할까요? 되돌릴 수 없어요.`)) return;
      await api(`/api/case/${encodeURIComponent(id)}`, { method: 'DELETE' });
      await load();
      location.hash = '#/list';
    };
  $$('input[data-money]', root).forEach((el) => {
    const hint = document.createElement('small');
    el.after(hint);
    const show = () => {
      const n = parseMoney(el.value);
      hint.textContent = el.value && n != null ? `= ${n.toLocaleString('ko-KR')}원` : '';
    };
    el.oninput = show;
    show();
  });
}

// ---------- 일정 ----------
const cal = { y: null, m: null, only: false };
function viewCalendar() {
  const t = new Date(S.today);
  if (cal.y == null) [cal.y, cal.m] = [t.getFullYear(), t.getMonth()];
  const first = new Date(cal.y, cal.m, 1);
  const start = new Date(first);
  start.setDate(1 - first.getDay());
  const evs = S.allEvents.filter((e) => !cal.only || e.watch);
  const key = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const cells = [...Array(42)].map((_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const k = key(d);
    const list = evs.filter((e) => e.date === k);
    return `<div class="d ${d.getMonth() !== cal.m ? 'out' : ''} ${k === S.today ? 'today' : ''}"><span class="n">${d.getDate()}</span>${list.slice(0, 3).map((e) => `<span class="ev ${esc(e.kind)}" title="${esc(e.title)}">${esc(e.kind)} ${esc(e.caseNo.slice(-6))}</span>`).join('')}${list.length > 3 ? `<span class="ev">+${list.length - 3}</span>` : ''}</div>`;
  });
  const monthKey = `${cal.y}-${String(cal.m + 1).padStart(2, '0')}`;
  const monthEvents = evs.filter((e) => e.date.startsWith(monthKey)).sort((a, b) => a.date.localeCompare(b.date));
  return `
  <h1>일정</h1>
  <p class="sub">물건마다 임장 → 전날 확인 → 입찰 일정이 자동으로 잡혀요. 낙찰받으면 허가·확정·잔금 일정이 추가돼요.</p>
  <div class="row between">
    <div class="row"><button class="btn sm" data-mon="-1">‹</button><b style="font-size:17px">${cal.y}년 ${cal.m + 1}월</b><button class="btn sm" data-mon="1">›</button></div>
    <div class="chips" style="margin:0"><button class="chip ${!cal.only ? 'on' : ''}" data-only="0">전체</button><button class="chip ${cal.only ? 'on' : ''}" data-only="1">⭐ 관심만</button></div>
  </div>
  <div class="month" style="margin-top:8px">${['일', '월', '화', '수', '목', '금', '토'].map((x) => `<div class="h">${x}</div>`).join('')}${cells.join('')}</div>
  <div class="card evlist" style="margin-top:12px">${monthEvents.length ? monthEvents.map((e) => `<a class="e" href="#/case/${encodeURIComponent(e.id || e.caseNo.replace(/[^\w가-힣-]/g, '_'))}" style="text-decoration:none;color:inherit"><div class="d">${e.date.slice(5)}</div><div><b>${esc(e.kind)}</b> ${esc(e.caseNo)} ${e.watch ? '⭐' : ''}<small>${esc(e.detail)}</small></div></a>`).join('') : '<div class="empty">이 달에는 일정이 없어요</div>'}</div>
  <h2>📲 내 캘린더에 넣기</h2>
  <div class="card">
    <div class="row"><a class="btn primary" href="/api/calendar.ics">⭐ 관심물건 일정 받기 (.ics)</a><a class="btn" href="/api/calendar.ics?all=1">전체 일정 받기</a></div>
    <ol class="steps" style="margin-top:12px">
      <li><div><b>구글 캘린더</b>: 컴퓨터에서 calendar.google.com → 톱니바퀴(설정) → 가져오기/내보내기 → 받은 파일 선택</div></li>
      <li><div><b>아이폰</b>: 받은 파일을 열면 "모두 추가"</div></li>
      <li><div>일정이 바뀌면 파일을 다시 받아 가져오세요 (같은 일정은 덮어써져요)</div></li>
    </ol>
  </div>`;
}
function bindCalendar(root) {
  $$('[data-mon]', root).forEach(
    (b) =>
      (b.onclick = () => {
        cal.m += Number(b.dataset.mon);
        if (cal.m < 0) [cal.m, cal.y] = [11, cal.y - 1];
        if (cal.m > 11) [cal.m, cal.y] = [0, cal.y + 1];
        render();
      }),
  );
  $$('[data-only]', root).forEach((b) => (b.onclick = () => ((cal.only = b.dataset.only === '1'), render())));
}

// ---------- 적중률 ----------
function viewLab() {
  const s = S.stats;
  const bar = (label, n) => `<div style="margin:10px 0"><div class="row between"><span>${label}</span><b>${s.n ? pct(n / s.n, 0) : '-'} <small class="sub">(${n}건)</small></b></div><div class="bar"><i style="width:${s.n ? (n / s.n) * 100 : 0}%"></i></div></div>`;
  return `
  <h1>🎯 내 추천가 적중률</h1>
  <p class="sub">입찰일이 지난 물건에 실제 낙찰가를 기록하면, 내 추천 입찰가가 얼마나 맞았는지 쌓여요. (물건 → 기록하기 → 입찰 결과)</p>
  ${s.rows.some((r) => r.sample) ? '<p class="warnbox">샘플(가상) 결과가 섞여 있어요. 실제 기록이 쌓이면 샘플을 지워 주세요.</p>' : ''}
  <div class="grid g4">
    <div class="card kpi"><div class="l">기록된 낙찰</div><div class="v">${s.n}건</div><div class="l">결과 기록 전체 ${s.recorded}건</div></div>
    <div class="card kpi"><div class="l">평균 오차</div><div class="v">${s.mae != null ? '±' + pct(s.mae) : '-'}</div><div class="l">표준편차 ${s.sd != null ? '±' + pct(s.sd) : '-'}</div></div>
    <div class="card kpi"><div class="l">치우침</div><div class="v">${s.bias != null ? (s.bias < 0 ? '낮게 ' : '높게 ') + pct(Math.abs(s.bias)) : '-'}</div><div class="l">낮게 ${s.low} · 높게 ${s.high}</div></div>
    <div class="card kpi"><div class="l">내 입찰</div><div class="v">${s.myWins}/${s.myBids}</div><div class="l">낙찰 / 입찰</div></div>
  </div>
  <div class="card" style="margin-top:12px">${bar('오차 ±5% 이내', s.within5)}${bar('오차 ±10% 이내', s.within10)}${bar('오차 ±15% 이내', s.within15)}${bar('오차 ±20% 이내', s.within20)}<p class="note" style="margin-bottom:0">💡 ${esc(s.hint)}</p></div>
  <h2>왜 평균만 보면 안 될까</h2>
  <div class="card"><p style="margin-top:0">추천가가 한 번은 10% 낮고 한 번은 20% 높으면 평균은 +5%로 그럴듯해 보여요. 하지만 실제로는 매번 크게 빗나간 거예요. 그래서 위처럼 <b>오차 구간별 비율</b>과 <b>치우침(낮게/높게)</b>을 같이 봐요.</p></div>
  <h2>기록</h2>
  ${s.rows.length ? `<div class="tw card" style="padding:0"><table style="width:100%"><tr><th>사건</th><th>추천가</th><th>실제 낙찰</th><th>오차</th><th>입찰자</th></tr>${s.rows.map((r) => `<tr><td>${esc(r.caseNo)}${r.sample ? '<span class="sample">샘플</span>' : ''}</td><td>${eok(r.recommended)}</td><td>${eok(r.winningBid)}</td><td style="color:${Math.abs(r.err) <= 0.05 ? 'var(--good)' : Math.abs(r.err) <= 0.15 ? 'var(--warn)' : 'var(--bad)'}">${r.err > 0 ? '+' : ''}${pct(r.err)}</td><td>${esc(r.bidders ?? '-')}</td></tr>`).join('')}</table></div>` : '<div class="card empty">아직 기록이 없어요</div>'}`;
}

// ---------- 콘텐츠 ----------
const contentState = { type: 'blog' };
async function viewContent(id) {
  const analyzed = S.cases.filter((c) => c.grade !== '보류');
  if (!analyzed.length) return `<h1>✍️ 콘텐츠</h1><div class="card empty"><div class="big">✍️</div>분석된 물건이 있어야 블로그·유튜브 원고를 만들 수 있어요.<div style="margin-top:10px"><button class="btn primary" data-act="samples">샘플로 체험</button></div></div>`;
  const cur = id || analyzed[0].id;
  const d = await api(`/api/content/${encodeURIComponent(cur)}?type=${contentState.type}`).catch((e) => ({ error: e.message }));
  const T = [['blog', '📝 블로그 글'], ['shorts', '📱 유튜브 쇼츠'], ['longform', '🎬 유튜브 롱폼']];
  return `
  <h1>✍️ 콘텐츠 만들기</h1>
  <p class="sub">분석한 물건을 블로그 글·유튜브 원고로 바꿔요. 주소의 동·호수와 개인정보는 자동으로 빠져요.</p>
  <div class="field"><label>물건</label><select id="pick">${analyzed.map((c) => `<option value="${esc(c.id)}" ${c.id === cur ? 'selected' : ''}>[${esc(c.grade)}] ${esc(c.caseNo)} ${esc(c.usage || '')}${c.sample ? ' (샘플)' : ''}</option>`).join('')}</select></div>
  <div class="chips">${T.map(([k, l]) => `<button class="chip ${contentState.type === k ? 'on' : ''}" data-type="${k}">${l}</button>`).join('')}</div>
  ${d.error ? `<p class="warnbox">${esc(d.error)}</p>` : `
  <div class="row between"><h3>사실 뼈대 초안</h3><div class="row"><button class="btn sm" data-copy="draft">복사</button><button class="btn sm primary" data-polish>🤖 AI로 자연스럽게 다듬기</button></div></div>
  <div class="copybox" id="draft">${esc(d.text)}</div>
  ${d.polished ? `<div class="row between"><h3>AI가 다듬은 원고</h3><button class="btn sm" data-copy="pol">복사</button></div><div class="copybox" id="pol">${esc(d.polished)}</div>` : ''}
  <p class="note" style="margin-top:12px">발행은 직접 해주세요. 경매 콘텐츠에는 "투자 권유·법률 자문 아님" 문구를 꼭 남겨 두세요.</p>`}`;
}
function bindContent(root) {
  const pick = $('#pick', root);
  if (pick) pick.onchange = () => (location.hash = `#/content/${encodeURIComponent(pick.value)}`);
  $$('[data-type]', root).forEach((b) => (b.onclick = () => ((contentState.type = b.dataset.type), render())));
  $$('[data-copy]', root).forEach(
    (b) =>
      (b.onclick = async () => {
        await navigator.clipboard.writeText($('#' + b.dataset.copy).textContent).catch(() => null);
        toast('복사했어요');
      }),
  );
  const pol = $('[data-polish]', root);
  if (pol)
    pol.onclick = async () => {
      const c = S.cases.find((x) => x.id === pick.value);
      afterJob(await api('/api/jobs', { method: 'POST', body: { kind: 'content', caseNo: c.caseNo, type: contentState.type } }));
    };
}

// ---------- AI 작업 ----------
async function viewJobs(id) {
  const j = id ? await api(`/api/jobs/${encodeURIComponent(id)}`).catch(() => null) : null;
  return `
  <h1>🤖 AI 작업</h1>
  <p class="sub">AI는 내 컴퓨터의 Claude Code(구독)로 돌아가요. API 키나 추가 요금은 없어요.</p>
  ${S.claude ? '<p class="note">✅ Claude Code 연결됨</p>' : '<p class="warnbox">Claude Code(claude 명령)를 찾지 못했어요. 설치 후 이 화면을 다시 켜 주세요. 그 전까지는 버튼을 누르면 붙여넣을 문장을 알려드려요.</p>'}
  <div class="actions"><button class="action" data-act="search"><span class="ic">🔎</span><b>물건 찾기</b><small>조건으로 순회·분석</small></button><button class="action" data-act="add"><span class="ic">➕</span><b>사건번호 분석</b><small>한 건 깊게</small></button></div>
  ${j ? `<h2>작업 기록 — ${esc(j.kind)} (${esc(j.status)})</h2><pre class="log" id="log">${esc(j.log || '(아직 출력 없음)')}</pre>` : ''}
  <h2>최근 작업</h2>
  ${S.jobs.length ? `<div class="card evlist">${S.jobs.map((x) => `<a class="e" href="#/jobs/${esc(x.id)}" style="text-decoration:none;color:inherit"><div class="d">${{ running: '⏳', done: '✅', failed: '❌', manual: '📋' }[x.status] || ''}</div><div><b>${esc({ search: '물건 찾기', analyze: '분석', update: '임장 반영', verify: '교차검증', content: '콘텐츠' }[x.kind] || x.kind)}</b> ${esc(x.params.caseNo || x.params.text || '')}<small>${esc(x.startedAt.replace('T', ' ').slice(0, 16))}</small></div></a>`).join('')}</div>` : '<div class="card empty">아직 실행한 작업이 없어요</div>'}`;
}

// ---------- 설정 ----------
function viewSettings() {
  const c = S.criteria;
  const b = c.buyer || {};
  const h = c.home || {};
  const k = S.costs;
  const E = k.eviction;
  const RISKS = ['유치권', '법정지상권', '지분매각', '선순위 가처분', '대지권미등기', '분묘기지권', '토지별도등기', '위반건축물'];
  const sel = (name, opts, v) => `<select name="${name}">${opts.map(([val, l]) => `<option value="${esc(val)}" ${String(v) === String(val) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
  const num = (name, label, v, hint, step = 'any') => `<div class="field"><label>${label}</label><input name="${name}" type="number" step="${step}" value="${esc(v ?? '')}">${hint ? `<small>${hint}</small>` : ''}</div>`;
  return `
  <h1>⚙️ 설정</h1>
  <p class="sub">여기 값이 모든 물건의 입찰가·세금·추천에 쓰여요. 저장하면 전체가 다시 계산돼요.</p>
  <form id="settings">
  <div class="card"><h3 style="margin-top:0">🎯 목적</h3>
    <div class="field"><label>무엇을 위해 경매를 하나요?</label>${sel('goal', [['투자(단기매도)', '투자 — 팔아서 수익'], ['임대(전세·월세)', '임대 — 세 놓기'], ['실거주', '실거주 — 내 집 마련'], ['상관없음', '상관없음 — 가장 유리한 방법 추천']], c.goal)}</div>
  </div>
  <div class="card" style="margin-top:12px"><h3 style="margin-top:0">💰 내 돈</h3>
    <div class="grid g2">
      ${mInput('cashAvailable', '쓸 수 있는 현금', c.cashAvailable, '예: 2억')}
      ${num('loanRatio', '대출 비율 (%)', b.loanRatio != null ? Math.round(b.loanRatio * 100) : '', '경락잔금대출 — 은행 상담값 (모르면 60)')}
      ${num('interestRate', '대출 금리 (%)', b.interestRate != null ? +(b.interestRate * 100).toFixed(2) : '', '')}
      ${num('holdMonths', '보유 기간 (개월)', b.holdMonths, '매도까지 예상 기간')}
      ${num('houseCountAfter', '낙찰 후 주택 수', b.houseCountAfter, '취득세 중과 판단', '1')}
      ${num('targetMarginRate', '목표 마진 (%)', c.targetMarginRate != null ? +(c.targetMarginRate * 100).toFixed(1) : '', '높을수록 보수적인 입찰가')}
    </div>
    <label class="check"><input type="checkbox" name="firstHome" ${b.firstHome ? 'checked' : ''}> 생애최초 주택 구입 (취득세 감면)</label>
    <label class="check"><input type="checkbox" name="regulatedArea" ${b.regulatedArea ? 'checked' : ''}> 조정대상지역 물건</label>
  </div>
  <div class="card" style="margin-top:12px"><h3 style="margin-top:0">🔎 찾는 물건</h3>
    <div class="grid g2">
      ${tInput('court', '법원', c.court, '예: 수원지방법원')}
      ${tInput('sido', '시·도', c.sido, '예: 경기도')}
      ${tInput('sigungu', '시·군·구', c.sigungu, '예: 화성시')}
      <div class="field"><label>용도</label>${sel('usage', [['', '전체'], ['아파트', '아파트'], ['다세대', '빌라·다세대'], ['오피스텔', '오피스텔'], ['단독주택', '단독주택'], ['상가', '상가'], ['토지', '토지']], c.usage || '')}</div>
      ${mInput('maxMinPrice', '최저가 상한', c.maxMinPrice, '예: 5억')}
      ${num('minFailCount', '최소 유찰 횟수', c.minFailCount, '', '1')}
      ${num('areaM2Min', '면적 최소 (㎡)', c.areaM2Min)}
      ${num('areaM2Max', '면적 최대 (㎡)', c.areaM2Max)}
      ${num('maxCandidates', '한 번에 볼 물건 수', c.maxCandidates, '사이트 배려 — 15 이하 권장', '1')}
    </div>
    <div class="field"><label>무조건 제외할 위험</label>${RISKS.map((r) => `<label class="check"><input type="checkbox" name="risk" value="${r}" ${(c.excludeRisks || []).includes(r) ? 'checked' : ''}> ${r}</label>`).join('')}</div>
  </div>
  <div class="card" style="margin-top:12px"><h3 style="margin-top:0">🏠 실거주 기준 (목적이 실거주일 때)</h3>
    <div class="grid g2">
      ${tInput('workplace', '직장 위치', h.workplace, '예: 판교역')}
      ${num('commuteMaxMin', '출퇴근 최대 (분)', h.commuteMaxMin, '', '1')}
      ${num('minRooms', '방 최소 개수', h.minRooms, '', '1')}
      ${tInput('moveInBy', '입주 희망 시기', h.moveInBy, '예: 2027-03')}
    </div>
    <label class="check"><input type="checkbox" name="needSchool" ${h.needSchool ? 'checked' : ''}> 초등학교 도보 거리 필요</label>
  </div>
  <div class="card" style="margin-top:12px"><h3 style="margin-top:0">🧾 비용 추정치 (고급)</h3>
    <p class="sub">임장 전 기본값이에요. 물건별로 실제 값을 기록하면 그게 우선이에요.</p>
    <div class="grid g3">
      ${mInput('mvLow', '이사비 협의 (적게)', E.moveOutPayment.low, '예: 200만')}
      ${mInput('mvMid', '이사비 협의 (보통)', E.moveOutPayment.mid, '예: 300만')}
      ${mInput('mvHigh', '이사비 협의 (많이)', E.moveOutPayment.high, '예: 500만')}
      ${mInput('perM2', '강제집행 ㎡당', E.forcedExecution.perM2, '예: 4만')}
      ${num('vacancyMonths', '임대 세팅 공실 (개월)', k.lease.vacancyMonths)}
      ${num('rentalHorizonMonths', '임대 보유 기간 (개월)', k.rentalHorizonMonths, '', '1')}
      ${num('jeonseRiskRatio', '전세가율 위험선 (%)', Math.round(k.jeonseRiskRatio * 100), '이 이상이면 역전세 경고', '1')}
    </div>
    <p class="note">세율은 auction/config/tax-rates.json 에 있어요. 법이 바뀌면 Claude에게 "세율 최신으로 확인해줘"라고 말해 주세요.</p>
  </div>
  <div class="row" style="margin:16px 0"><button class="btn primary" style="flex:1">저장하고 다시 계산</button></div>
  </form>
  <div class="card"><h3 style="margin-top:0">🧪 샘플 데이터</h3><div class="row"><button class="btn" data-act="samples">샘플 불러오기</button><button class="btn danger" data-act="clear">샘플 지우기</button></div></div>
  <div class="card" style="margin-top:12px"><h3 style="margin-top:0">📄 리포트</h3><div class="row"><button class="btn" data-act="report">새 리포트 만들기</button>${S.reports.map((r) => `<a class="btn sm" href="/reports/${encodeURIComponent(r)}" target="_blank">${esc(r.slice(0, 8))}</a>`).join('')}</div></div>`;
}
function bindSettings(root) {
  $('#settings', root).onsubmit = async (e) => {
    e.preventDefault();
    const f = e.target;
    const v = (n) => (f.elements[n] ? f.elements[n].value.trim() : '');
    const n = (x) => (v(x) === '' ? null : Number(v(x)));
    const m = (x) => parseMoney(v(x));
    const chk = (x) => !!(f.elements[x] && f.elements[x].checked);
    const criteria = {
      goal: v('goal'),
      cashAvailable: m('cashAvailable'),
      targetMarginRate: n('targetMarginRate') != null ? n('targetMarginRate') / 100 : null,
      court: v('court'),
      sido: v('sido'),
      sigungu: v('sigungu'),
      usage: v('usage'),
      maxMinPrice: m('maxMinPrice'),
      minFailCount: n('minFailCount'),
      areaM2Min: n('areaM2Min'),
      areaM2Max: n('areaM2Max'),
      maxCandidates: n('maxCandidates'),
      excludeRisks: $$('input[name=risk]:checked', f).map((x) => x.value),
      buyer: {
        loanRatio: n('loanRatio') != null ? n('loanRatio') / 100 : null,
        interestRate: n('interestRate') != null ? n('interestRate') / 100 : null,
        holdMonths: n('holdMonths'),
        houseCountAfter: n('houseCountAfter'),
        firstHome: chk('firstHome'),
        regulatedArea: chk('regulatedArea'),
      },
      home: { workplace: v('workplace'), commuteMaxMin: n('commuteMaxMin'), minRooms: n('minRooms'), moveInBy: v('moveInBy'), needSchool: chk('needSchool') },
    };
    const costs = {
      eviction: { moveOutPayment: { low: m('mvLow'), mid: m('mvMid'), high: m('mvHigh') }, forcedExecution: { perM2: m('perM2') } },
      lease: { vacancyMonths: n('vacancyMonths') },
      rentalHorizonMonths: n('rentalHorizonMonths'),
      jeonseRiskRatio: n('jeonseRiskRatio') != null ? n('jeonseRiskRatio') / 100 : null,
    };
    // 숫자 칸을 비우면 기존 값 유지, 글자 칸을 비우면 조건 없음
    const prune = (o) => {
      if (Array.isArray(o) || typeof o !== 'object' || o === null) return o;
      const out = {};
      for (const [key, val] of Object.entries(o)) {
        const p = prune(val);
        if (p !== null && !(typeof p === 'number' && isNaN(p))) out[key] = p; // 빈 문자열은 '조건 없음'으로 저장
      }
      return out;
    };
    try {
      S = await api('/api/settings', { method: 'POST', body: { criteria: prune(criteria), costs: prune(costs) } });
      toast('저장했어요 — 모든 물건을 다시 계산했어요');
      render();
    } catch (err) {
      toast(err.message);
    }
  };
  $$('input[data-money]', root).forEach((el) => {
    const hint = document.createElement('small');
    el.after(hint);
    const show = () => {
      const x = parseMoney(el.value);
      hint.textContent = el.value && x != null ? `= ${x.toLocaleString('ko-KR')}원` : '';
    };
    el.oninput = show;
    show();
  });
}

// ---------- 라우터 ----------
async function render() {
  drawNav();
  const [, page, rawArg] = (location.hash || '#/').split('/');
  const arg = rawArg ? decodeURIComponent(rawArg) : rawArg; // 한글 사건번호는 주소에 인코딩되어 있음
  const app = $('#app');
  try {
    if (!S) await load();
    let html;
    if (page === 'list') html = viewList();
    else if (page === 'case') html = await viewCase(arg);
    else if (page === 'calendar') html = viewCalendar();
    else if (page === 'lab') html = viewLab();
    else if (page === 'content') html = await viewContent(arg);
    else if (page === 'jobs') html = await viewJobs(arg);
    else if (page === 'settings') html = viewSettings();
    else html = viewHome();
    app.innerHTML = html;
    bindActions(app);
    bindStars(app);
    if (page === 'list') bindList(app);
    if (page === 'case') bindCase(app);
    if (page === 'calendar') bindCalendar(app);
    if (page === 'content') bindContent(app);
    if (page === 'settings') bindSettings(app);
    if (page === 'jobs' && arg) {
      const j = S.jobs.find((x) => x.id === arg);
      if (j && j.status === 'running') setTimeout(() => location.hash.endsWith(arg) && render(), 3000);
    }
  } catch (e) {
    app.innerHTML = `<div class="card empty"><div class="big">⚠️</div>${esc(e.message)}<div style="margin-top:10px"><a class="btn" href="#/">홈으로</a></div></div>`;
  }
}

let lastHash = location.hash;
window.addEventListener('hashchange', () => {
  const [, prevPage, prevArg] = lastHash.split('/');
  const [, page, arg] = location.hash.split('/');
  if (page === 'case' && arg !== prevArg) detailTab = '요약';
  lastHash = location.hash;
  render();
  if (prevPage !== page) window.scrollTo(0, 0);
});
render();
// 실행 중인 AI 작업이 있으면 끝날 때 알림
load().then(() => S.jobs.filter((j) => j.status === 'running').forEach((j) => watchJob(j.id)));
