// AI 오피스 화면: 아이소메트릭 사무실(SVG) + 직원 상태 + 보고함·결재함·실시간·비서 브리핑 + 업무 지시
// index.html 의 전역 api / h / toast / $ / view 를 사용한다.
(() => {
  const GX = 14;
  const GY = 12;
  const TW = 72;
  const TH = 36;
  const M = 30;
  const WALL = 190;
  const OX = M + GY * (TW / 2);
  const OY = M + WALL + 10;
  const VW = OX + GX * (TW / 2) + M;
  const VH = OY + (GX + GY) * (TH / 2) + 40;

  const iso = (x, y, z = 0) => [OX + (x - y) * (TW / 2), OY + (x + y) * (TH / 2) - z];
  const pts = (arr) => arr.map((p) => p.map((n) => n.toFixed(1)).join(',')).join(' ');
  // 색 어둡게/밝게 (#RRGGBB → #RRGGBB, 결과를 다시 넣어도 동작)
  const shade = (hex, f) => {
    const n = parseInt(hex.slice(1), 16);
    const c = [n >> 16, (n >> 8) & 255, n & 255].map((v) => Math.max(0, Math.min(255, Math.round(v * f))));
    return `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
  };

  // 상자: 윗면 + 앞쪽 두 면 (빛은 왼쪽 위)
  function box(x, y, w, d, h, color, z0 = 0, extra = '') {
    const t = [iso(x, y, z0 + h), iso(x + w, y, z0 + h), iso(x + w, y + d, z0 + h), iso(x, y + d, z0 + h)];
    const left = [iso(x, y + d, z0 + h), iso(x + w, y + d, z0 + h), iso(x + w, y + d, z0), iso(x, y + d, z0)];
    const right = [iso(x + w, y, z0 + h), iso(x + w, y + d, z0 + h), iso(x + w, y + d, z0), iso(x + w, y, z0)];
    return `<g ${extra}><polygon points="${pts(left)}" fill="${shade(color, 0.86)}"/><polygon points="${pts(right)}" fill="${shade(color, 0.7)}"/><polygon points="${pts(t)}" fill="${color}"/></g>`;
  }

  function plant(x, y, s = 1) {
    const [px, py] = iso(x + 0.25, y + 0.25, 18 * s);
    return { k: x + y + 0.5, svg: `${box(x, y, 0.5, 0.5, 18 * s, '#C2703D')}<g>
      <circle cx="${px - 9 * s}" cy="${py - 8 * s}" r="${11 * s}" fill="#2F7D3A"/><circle cx="${px + 9 * s}" cy="${py - 10 * s}" r="${12 * s}" fill="#3B9B47"/>
      <circle cx="${px}" cy="${py - 22 * s}" r="${12 * s}" fill="#4CB35A"/><circle cx="${px + 3 * s}" cy="${py - 6 * s}" r="${9 * s}" fill="#358C40"/></g>` };
  }

  function skyline(axis) {
    // 유리벽 너머 도시: 벽면을 따라 기울어진 건물 실루엣
    let svg = '';
    let seed = axis === 'x' ? 7 : 13;
    const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
    const len = axis === 'x' ? GX : GY;
    for (let a = 0; a < len; ) {
      const w = 0.6 + rnd() * 1.1;
      const hgt = 50 + rnd() * 120;
      const P = (u, z) => (axis === 'x' ? iso(u, 0, z) : iso(0, u, z));
      const b = Math.min(len, a + w);
      svg += `<polygon points="${pts([P(a, 0), P(b, 0), P(b, hgt), P(a, hgt)])}" fill="rgba(40,30,70,${0.35 + rnd() * 0.3})"/>`;
      for (let k = 0; k < 4; k++) {
        const u = a + 0.15 + rnd() * (b - a - 0.3);
        const z = 15 + rnd() * (hgt - 25);
        const [wx, wy] = P(u, z);
        svg += `<rect x="${wx.toFixed(1)}" y="${wy.toFixed(1)}" width="3" height="3" fill="#FFD98A" opacity="${0.5 + rnd() * 0.5}"/>`;
      }
      a = b + rnd() * 0.25;
    }
    return svg;
  }

  function room() {
    const wallR = [iso(0, 0, 0), iso(GX, 0, 0), iso(GX, 0, WALL), iso(0, 0, WALL)];
    const wallL = [iso(0, 0, 0), iso(0, GY, 0), iso(0, GY, WALL), iso(0, 0, WALL)];
    const floor = [iso(0, 0), iso(GX, 0), iso(GX, GY), iso(0, GY)];
    const slabL = [iso(0, GY), iso(GX, GY), iso(GX, GY, -16), iso(0, GY, -16)];
    const slabR = [iso(GX, 0), iso(GX, GY), iso(GX, GY, -16), iso(GX, 0, -16)];
    const [sx, sy] = iso(GX * 0.78, 0, WALL * 0.32);
    let mull = '';
    for (let x = 2; x < GX; x += 2) mull += `<line x1="${iso(x, 0, 0)[0]}" y1="${iso(x, 0, 0)[1]}" x2="${iso(x, 0, WALL)[0]}" y2="${iso(x, 0, WALL)[1]}" stroke="rgba(255,255,255,.35)" stroke-width="2"/>`;
    for (let y = 2; y < GY; y += 2) mull += `<line x1="${iso(0, y, 0)[0]}" y1="${iso(0, y, 0)[1]}" x2="${iso(0, y, WALL)[0]}" y2="${iso(0, y, WALL)[1]}" stroke="rgba(255,255,255,.35)" stroke-width="2"/>`;
    let planks = '';
    for (let x = 1; x < GX; x++) planks += `<line x1="${iso(x, 0)[0]}" y1="${iso(x, 0)[1]}" x2="${iso(x, GY)[0]}" y2="${iso(x, GY)[1]}" stroke="rgba(150,95,45,.12)" stroke-width="1.5"/>`;
    return `
      <defs>
        <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4C3B7A"/><stop offset=".55" stop-color="#C77DA0"/><stop offset="1" stop-color="#FFB47A"/></linearGradient>
        <linearGradient id="wood" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#F6D7AE"/><stop offset="1" stop-color="#E9B884"/></linearGradient>
        <radialGradient id="sun"><stop offset="0" stop-color="#FFF1C2"/><stop offset=".4" stop-color="#FFC36B" stop-opacity=".9"/><stop offset="1" stop-color="#FF9A5A" stop-opacity="0"/></radialGradient>
      </defs>
      <polygon points="${pts(wallR)}" fill="url(#sky)"/><polygon points="${pts(wallL)}" fill="url(#sky)"/>
      <circle cx="${sx}" cy="${sy}" r="60" fill="url(#sun)"/>
      ${skyline('x')}${skyline('y')}${mull}
      <polygon points="${pts([iso(0, 0, WALL), iso(GX, 0, WALL), iso(GX, 0, WALL - 8), iso(0, 0, WALL - 8)])}" fill="#EDE7DE"/>
      <polygon points="${pts([iso(0, 0, WALL), iso(0, GY, WALL), iso(0, GY, WALL - 8), iso(0, 0, WALL - 8)])}" fill="#E2DACE"/>
      <polygon points="${pts(slabL)}" fill="#C79A6B"/><polygon points="${pts(slabR)}" fill="#A87D52"/>
      <polygon points="${pts(floor)}" fill="url(#wood)"/>${planks}`;
  }

  function carpet(x, y, w, d, color) {
    const p = [iso(x, y, 0.5), iso(x + w, y, 0.5), iso(x + w, y + d, 0.5), iso(x, y + d, 0.5)];
    return `<polygon points="${pts(p)}" fill="${color}" fill-opacity=".22" stroke="${color}" stroke-opacity=".22" stroke-width="14" stroke-linejoin="round"/>`;
  }

  function teamSign(x, y, text, color) {
    const [sx, sy] = iso(x, y, 46);
    const w = text.length * 15 + 26;
    return `<g transform="translate(${sx},${sy}) skewY(26.5)"><rect x="${-w / 2}" y="-15" width="${w}" height="30" rx="6" fill="${color}"/>
      <text x="0" y="6" text-anchor="middle" font-size="15" font-weight="800" fill="#fff">${h(text)}</text></g>`;
  }

  const STATUS = {
    working: { color: '#16A34A', bubble: '⌨️', label: '작업 중' },
    waiting: { color: '#DC2626', bubble: '📋', label: '결재 대기' },
    warn: { color: '#D97706', bubble: '⚠️', label: '확인 필요' },
    idle: { color: '#9CA3AF', bubble: '💤', label: '대기' },
  };

  // 직원 책상 + 의자 + 사람 (책상 앞에 앉아 모니터를 보는 모습: 등이 보인다)
  function workstation(e, dim) {
    const [dx, dy] = e.desk;
    const st = STATUS[e.status] || STATUS.idle;
    const parts = [];
    parts.push(box(dx - 0.7, dy - 0.45, 1.5, 0.75, 24, '#FBFAF7'));
    parts.push(box(dx - 0.45, dy - 0.38, 0.9, 0.08, 26, '#2B2F3A', 24));
    // 모니터 화면 빛 (작업 중일 때 밝게)
    const scr = [iso(dx - 0.42, dy - 0.3, 48), iso(dx + 0.42, dy - 0.3, 48), iso(dx + 0.42, dy - 0.3, 27), iso(dx - 0.42, dy - 0.3, 27)];
    parts.push(`<polygon points="${pts(scr)}" fill="${e.status === 'working' ? '#7DD3FC' : '#3B4253'}" ${e.status === 'working' ? 'class="glow"' : ''}/>`);
    parts.push(box(dx - 0.25, dy + 0.55, 0.5, 0.45, 13, e.teamColor));
    // 사람
    const [cx, cy] = iso(dx, dy + 0.75, 13);
    const hair = { content: '#3B2A20', edit: '#1F2937', review: '#6B4E3D', ops: '#2D2A26' }[e.team] || '#333';
    parts.push(`<g class="person ${e.status === 'working' ? 'typing' : ''}">
      <rect x="${cx - 13}" y="${cy - 26}" width="26" height="28" rx="11" fill="${e.teamColor}"/>
      <rect x="${cx - 4}" y="${cy - 28}" width="8" height="5" fill="#E9B98F"/>
      <circle cx="${cx - 11.5}" cy="${cy - 34}" r="3" fill="#F2C49B"/><circle cx="${cx + 11.5}" cy="${cy - 34}" r="3" fill="#F2C49B"/>
      <circle cx="${cx}" cy="${cy - 36}" r="12" fill="${hair}"/>
      <path d="M${cx - 8},${cy - 44} q8,-5 16,0" stroke="rgba(255,255,255,.18)" stroke-width="2" fill="none"/></g>`);
    parts.push(box(dx - 0.25, dy + 0.95, 0.5, 0.1, 22, shade(e.teamColor, 0.8)));
    // 이름표 + 상태
    const [tx, ty] = iso(dx, dy + 0.75, 70);
    const tw = e.name.length * 13 + 30;
    parts.push(`<g class="tag"><rect x="${tx - tw / 2}" y="${ty - 13}" width="${tw}" height="24" rx="12" fill="#fff" stroke="rgba(0,0,0,.08)"/>
      <circle cx="${tx - tw / 2 + 13}" cy="${ty - 1}" r="4.5" fill="${st.color}"/>
      <text x="${tx + 6}" y="${ty + 4}" text-anchor="middle" font-size="13" font-weight="700" fill="#222">${h(e.name)}</text></g>`);
    parts.push(`<g class="bubble ${e.status}"><circle cx="${tx + tw / 2 + 4}" cy="${ty - 22}" r="15" fill="#fff" stroke="rgba(0,0,0,.08)"/>
      <text x="${tx + tw / 2 + 4}" y="${ty - 16}" text-anchor="middle" font-size="16">${st.bubble}</text></g>`);
    return { k: dx + dy + 1, svg: `<g class="emp${dim ? ' dim' : ''}" data-emp="${e.id}" style="cursor:pointer">${parts.join('')}</g>` };
  }

  function scene(s, filter) {
    const items = [];
    const T = s.teams;
    const zones = { content: [1.6, 1.8, 5.2, 3.6], edit: [7.8, 1.8, 3.6, 3.6], review: [1.6, 6.8, 5.2, 3.6], ops: [7.8, 6.8, 3.6, 3.6] };
    let floorDecor = '';
    for (const [k, z] of Object.entries(zones)) floorDecor += carpet(z[0], z[1], z[2], z[3], T[k].color);
    // 라운지·회의 공간
    floorDecor += carpet(11.9, 8.6, 1.9, 3.2, '#94A3B8');
    items.push({ k: 7, svg: box(5.6, 5.4, 2.6, 1.0, 20, '#D9A066') });
    for (const [cx, cy] of [[5.9, 5.0], [6.9, 5.0], [7.9, 5.0], [5.9, 6.5], [6.9, 6.5], [7.9, 6.5]]) items.push({ k: cx + cy, svg: box(cx - 0.15, cy - 0.15, 0.35, 0.35, 12, '#E8774A') });
    items.push({ k: 21, svg: box(12.3, 9.0, 1.3, 2.6, 14, '#E9E4DA') + box(13.3, 9.0, 0.35, 2.6, 30, '#DDD6CA') });
    items.push({ k: 22.5, svg: box(12.4, 10.0, 0.4, 0.4, 16, '#7CC36E') + box(12.4, 10.6, 0.4, 0.4, 16, '#F59E8B') });
    // 커피바 (뒷벽)
    items.push({ k: 6, svg: box(4.6, 0.15, 3.2, 0.6, 30, '#B7794A') + box(5.0, 0.2, 0.5, 0.4, 16, '#444', 30) });
    // 책장 (왼쪽 벽)
    items.push({ k: 6.4, svg: box(0.15, 4.6, 0.5, 1.8, 74, '#9A6B45') });
    // 사장님 자리
    items.push({ k: 16, svg: box(11.7, 4.0, 1.8, 0.8, 24, '#7A5235') + box(12.2, 4.05, 0.7, 0.08, 22, '#2B2F3A', 24) });
    const [bx, by] = iso(12.6, 5.2, 70);
    items.push({ k: 16.6, svg: `<g><rect x="${bx - 52}" y="${by - 13}" width="104" height="24" rx="12" fill="#1D1D1B"/><text x="${bx}" y="${by + 4}" text-anchor="middle" font-size="13" font-weight="700" fill="#fff">사장님 (나)</text></g>` });
    for (const [x, y, sc] of [[0.3, 0.3, 1.2], [13.2, 0.3, 1.1], [0.3, 11.2, 1.1], [3.8, 0.3, 0.9], [9.2, 0.3, 0.9], [13.3, 7.4, 1], [0.3, 7.6, 1], [6.9, 11.2, 1], [10.4, 11.2, 0.9]]) items.push(plant(x, y, sc));
    for (const e of s.employees) items.push(workstation(e, filter !== 'all' && e.team !== filter));
    for (const [k, z] of Object.entries(zones)) {
      if (filter === 'all' || filter === k) items.push({ k: z[0] + z[1] - 0.5, svg: teamSign(z[0] + z[2] / 2, z[1] - 0.15, T[k].name, T[k].color) });
    }
    items.sort((a, b) => a.k - b.k);
    const signs = '';
    return `<svg viewBox="0 0 ${VW} ${VH}" xmlns="http://www.w3.org/2000/svg" font-family="Pretendard,'Apple SD Gothic Neo','Malgun Gothic',sans-serif">
      ${room()}${floorDecor}${items.map((i) => i.svg).join('')}${signs}</svg>`;
  }

  // ---------- 화면 ----------
  let filter = 'all';
  let panel = null;
  let selected = null;
  let lastJson = '';
  let briefingText = '';

  const css = `
  .office-top{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin:16px 0 10px}
  .chip{border:1px solid var(--line);background:#fff;border-radius:99px;padding:8px 14px;font-weight:700;font-size:14px;cursor:pointer;font-family:inherit;color:var(--ink)}
  .chip.on{background:var(--ink);color:#fff;border-color:var(--ink)}
  .chip .n{display:inline-block;min-width:20px;padding:0 6px;margin-left:4px;border-radius:99px;background:#E11D48;color:#fff;font-size:12px}
  .chip .n.z{background:#ddd;color:#666}
  .scene{position:relative;border-radius:22px;overflow:auto;background:#2A2142;box-shadow:0 10px 30px rgba(0,0,0,.15);-webkit-overflow-scrolling:touch}
  .scene svg{display:block;min-width:760px;width:100%;height:auto}
  .filters{display:flex;gap:6px;background:#fff;border:1px solid var(--line);padding:5px;border-radius:99px;margin:0 0 10px;white-space:nowrap;overflow-x:auto;width:max-content;max-width:100%}
  .filters button{border:0;background:none;padding:6px 10px;border-radius:99px;font:700 12px inherit;cursor:pointer;color:#333;font-family:inherit}
  .filters button.on{background:#1D1D1B;color:#fff}
  .emp.dim{opacity:.28}
  .emp:hover .tag rect{stroke:#1D1D1B;stroke-width:2}
  .bubble.working{animation:bob 1.2s ease-in-out infinite}
  .bubble.waiting{animation:pulse 1.6s ease-in-out infinite}
  .person.typing{animation:type .5s ease-in-out infinite alternate}
  .glow{animation:glow 1.4s ease-in-out infinite alternate}
  @keyframes bob{50%{transform:translateY(-5px)}}
  @keyframes pulse{50%{opacity:.45}}
  @keyframes type{to{transform:translateY(-1.5px)}}
  @keyframes glow{to{fill:#BAE6FD}}
  .cmd{position:sticky;bottom:calc(92px + env(safe-area-inset-bottom));display:flex;gap:8px;background:#fff;border:1px solid var(--line);border-radius:22px;padding:8px;box-shadow:0 8px 24px rgba(0,0,0,.08);margin:14px 0;z-index:4}
  .cmd select{width:auto;max-width:120px;border-radius:16px;padding:10px 6px;font-size:14px}
  .cmd input{flex:1;min-width:0;border-radius:16px;padding:10px 14px;font-size:15px}
  .item{border-bottom:1px solid var(--line);padding:14px 0}
  .item:last-child{border-bottom:0}
  .item .who{font-size:12px;color:var(--sub);font-weight:700}
  .item .ttl{font-weight:800;margin:4px 0 6px}
  .item.unread .ttl:before{content:"";display:inline-block;width:8px;height:8px;border-radius:50%;background:#E11D48;margin-right:6px;vertical-align:middle}
  .empcard{display:flex;gap:14px;align-items:center}
  .empcard .av{width:54px;height:54px;border-radius:18px;display:flex;align-items:center;justify-content:center;font-size:28px;flex:none}
  main.wide{max-width:1100px}`;

  function ensureCss() {
    if (document.getElementById('office-css')) return;
    const st = document.createElement('style');
    st.id = 'office-css';
    st.textContent = css;
    document.head.appendChild(st);
  }

  function panelHtml(s) {
    if (panel === 'approvals') {
      if (!s.approvals.length) return '<p class="muted">결재할 게 없어요. 👍</p>';
      return s.approvals.map((a) => `<div class="item"><div class="who">${h(a.from)}</div><div class="ttl">${h(a.title)}</div>
        ${a.detail ? `<pre class="rev" style="font-size:13px;margin-bottom:8px">${h(a.detail)}</pre>` : ''}
        ${a.kind === 'blog' ? `<div class="hint" style="margin-bottom:8px">초안 파일: ${h(a.draft)} · 승인하면 네이버에 <b>임시저장</b>까지만 해요. 발행은 네이버에서 직접.</div>
          <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn small" data-approve="${h(a.id)}">✅ ${h(a.action)}</button><button class="btn ghost small" data-reject="${h(a.id)}">반려</button></div>`
          : `<a class="btn small" href="${h(a.link)}">${h(a.action)} →</a>`}</div>`).join('');
    }
    if (panel === 'reports') {
      if (!s.reports.length) return '<p class="muted">아직 보고가 없어요.</p>';
      return s.reports.map((r) => `<div class="item ${r.read ? '' : 'unread'}" data-report="${h(r.id)}"><div class="who">${h(r.from)} · ${fmtDate(r.at)} · ${({ report: '보고', done: '임시저장 완료', error: '문제 발생', rejected: '반려됨' })[r.status] || r.status}</div>
        <div class="ttl">${h(r.instruction.slice(0, 60))}</div><pre class="rev" style="font-size:13px;max-height:260px">${h(r.body || '(내용 없음)')}</pre></div>`).join('');
    }
    if (panel === 'live') {
      if (!s.live.length) return '<p class="muted">최근 활동이 없어요.</p>';
      return s.live.map((l) => `<div class="item" style="padding:10px 0"><div class="who">${fmtDate(l.at)}</div><div>${h(l.text)}</div></div>`).join('');
    }
    if (panel === 'briefing') return `<pre class="rev">${h(briefingText || '불러오는 중...')}</pre>`;
    if (panel === 'emp' && selected) {
      const e = s.employees.find((x) => x.id === selected);
      if (!e) return '';
      const st = STATUS[e.status] || STATUS.idle;
      const canTalk = ['secretary', 'writer', 'reels'].includes(e.id);
      return `<div class="empcard"><div class="av" style="background:${e.teamColor}22">${e.avatar}</div><div><div class="who" style="font-size:12px;color:var(--sub);font-weight:700">${h(e.teamName)}</div>
        <div style="font-weight:800;font-size:18px">${h(e.name)} <span class="badge" style="background:${st.color}22;color:${st.color}">${st.label}</span></div>
        <div class="hint" style="margin-top:4px">${h(e.role)}</div></div></div>
        <div style="margin-top:12px">${h(e.note || '')}</div>
        <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap">${e.link ? `<a class="btn ghost small" href="${h(e.link)}">자세히 보기 →</a>` : ''}
        ${canTalk ? `<button class="btn small" data-talk="${e.id}">${e.id === 'reels' ? '새 릴스 맡기기' : '업무 지시하기'}</button>` : ''}</div>`;
    }
    return '';
  }

  async function officeView() {
    ensureCss();
    view.classList.add('wide');
    view.innerHTML = `<div class="row"><div><div class="eyebrow">우리 팀 작업실</div><h1>오피스<i>.</i></h1></div></div>
      <p class="lead" style="margin-bottom:4px">직원을 누르면 하는 일과 지금 상태가 보여요. 결재는 사장님만 할 수 있어요.</p>
      <div class="office-top" id="otop"></div>
      <div class="filters" id="ofilters"></div>
      <div class="scene" id="oscene"></div>
      <div class="card" id="opanel" style="display:none"></div>
      <div class="cmd"><select id="oEmp"><option value="secretary">🗂️ 비서</option><option value="writer">✍️ 블로그 작가</option><option value="reels">🎬 릴스 PD</option></select>
        <input id="oMsg" maxlength="1500" placeholder="직원에게 말하기 — 예) 이번 주 올릴 것 정리해줘"><button class="btn small" id="oSend">보내기</button></div>`;
    $('#oEmp').onchange = () => {
      $('#oMsg').placeholder = {
        secretary: '직원에게 말하기 — 예) 이번 주 올릴 것 정리해줘',
        writer: '예) 다이소 배수구 클리너, 내돈내산, 2주 써보니 냄새 끝 (사진은 input/photos에)',
        reels: '예) 배수구 클리너 30초 릴스 → 만들기 화면으로 이동해요',
      }[$('#oEmp').value];
    };
    $('#oSend').onclick = send;
    $('#oMsg').onkeydown = (e) => e.key === 'Enter' && !e.isComposing && send();
    lastJson = '';
    await refresh(true);
  }

  async function send() {
    const emp = $('#oEmp').value;
    const msg = $('#oMsg').value.trim();
    if (emp === 'reels') {
      location.hash = '#create';
      setTimeout(() => { const t = document.getElementById('topic'); if (t && msg) t.value = msg; }, 300);
      return;
    }
    if (!msg) return toast('지시할 내용을 적어 주세요.');
    $('#oSend').disabled = true;
    try {
      await api('/api/office/tasks', { method: 'POST', body: { employee: emp, instruction: msg } });
      $('#oMsg').value = '';
      toast(emp === 'writer' ? '블로그 작가가 초안을 쓰기 시작했어요 (몇 분 걸려요).' : '비서가 정리하고 있어요.');
      lastJson = '';
      await refresh();
    } catch (e) { toast(e.message); }
    $('#oSend').disabled = false;
  }

  async function refresh(first) {
    if (!document.getElementById('oscene')) return;
    let s;
    try { s = await api('/api/office'); } catch (e) { toast(e.message); return; }
    if (!document.getElementById('oscene')) return; // 그사이 다른 탭으로 이동
    const json = JSON.stringify([s, filter, panel, selected, briefingText]);
    if (json !== lastJson) {
      lastJson = json;
      const sc = $('#oscene');
      const keep = sc.scrollLeft;
      $('#ofilters').innerHTML = [['all', '전체'], ...Object.entries(s.teams).map(([k, v]) => [k, v.name])].map(([k, v]) => `<button data-f="${k}" class="${filter === k ? 'on' : ''}">${h(v)}</button>`).join('');
      sc.innerHTML = scene(s, filter);
      if (first) sc.scrollLeft = (sc.scrollWidth - sc.clientWidth) / 2;
      else sc.scrollLeft = keep;
      $('#ofilters').querySelectorAll('[data-f]').forEach((b) => (b.onclick = () => { filter = b.dataset.f; lastJson = ''; refresh(); }));
      sc.querySelectorAll('[data-emp]').forEach((g) => (g.onclick = () => { selected = g.dataset.emp; panel = 'emp'; lastJson = ''; refresh(); }));
      $('#otop').innerHTML = [
        ['reports', '📥 보고함', s.unread], ['approvals', '✍️ 결재함', s.approvals.length], ['live', '⚡ 실시간', null], ['briefing', '🗂️ 비서 브리핑', null],
      ].map(([k, l, n]) => `<button class="chip ${panel === k ? 'on' : ''}" data-p="${k}">${l}${n !== null ? `<span class="n ${n ? '' : 'z'}">${n}</span>` : ''}</button>`).join('') +
        `<span class="muted" style="font-size:13px;margin-left:auto">오늘 AI 작업 ${s.todayTasks}건</span>`;
      $('#otop').querySelectorAll('[data-p]').forEach((b) => (b.onclick = async () => {
        panel = panel === b.dataset.p ? null : b.dataset.p;
        if (panel === 'briefing') { briefingText = ''; api('/api/office/briefing').then((r) => { briefingText = r.text; lastJson = ''; refresh(); }); }
        lastJson = ''; refresh();
      }));
      const pn = $('#opanel');
      pn.style.display = panel ? '' : 'none';
      pn.innerHTML = panelHtml(s);
      pn.querySelectorAll('[data-approve]').forEach((b) => (b.onclick = async () => {
        if (!confirm('이 초안을 네이버에 임시저장할까요? (발행은 하지 않아요)')) return;
        try { await api(`/api/office/tasks/${b.dataset.approve}/approve`, { method: 'POST' }); toast('임시저장을 시작했어요. 크롬 창이 열려요.'); lastJson = ''; refresh(); } catch (e) { toast(e.message); }
      }));
      pn.querySelectorAll('[data-reject]').forEach((b) => (b.onclick = async () => { await api(`/api/office/tasks/${b.dataset.reject}/reject`, { method: 'POST' }); lastJson = ''; refresh(); }));
      pn.querySelectorAll('[data-report]').forEach((el) => {
        if (el.classList.contains('unread')) api(`/api/office/tasks/${el.dataset.report}/read`, { method: 'POST' }).catch(() => {});
      });
      pn.querySelectorAll('[data-talk]').forEach((b) => (b.onclick = () => { $('#oEmp').value = b.dataset.talk; $('#oEmp').onchange(); $('#oMsg').focus(); }));
    }
    clearTimeout(timer);
    timer = setTimeout(refresh, 3000);
  }

  window.officeView = officeView;
})();
