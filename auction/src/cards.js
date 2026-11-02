// 블로그용 분석 카드 이미지 (PNG): 요약 · 권리 타임라인 · 입찰가 · 활용법 비교 · 체크리스트
// HTML 을 그려 Playwright 로 캡처한다. 주소는 동까지만, 개인 이름 없음.
const fs = require('fs');
const path = require('path');
const { won, eok, pct, ymd, toDate } = require('./lib/util');
const { publicAddress } = require('./content');

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const GRADE = { A: ['입찰 검토', '#2f6b3a'], B: ['조건부', '#3d5a80'], C: ['관망', '#9a6a00'], X: ['제외', '#b3401f'], 보류: ['자료 부족', '#77756e'] };

const CSS = `*{box-sizing:border-box}body{margin:0;background:#f6f5f1;font-family:"Apple SD Gothic Neo","Malgun Gothic","Noto Sans KR","Noto Sans CJK KR",sans-serif;color:#1d1d1b}
.card{width:960px;padding:48px 56px 40px;background:#fff}
.k{font-size:22px;color:#6b6a64;margin:0 0 6px}.t{font-size:40px;font-weight:800;margin:0 0 28px;line-height:1.3}
.badge{display:inline-block;color:#fff;border-radius:12px;padding:6px 16px;font-size:24px;font-weight:800;margin-right:10px;vertical-align:middle}
.row{display:flex;gap:16px;margin:14px 0}.box{flex:1;background:#f2f1ec;border-radius:18px;padding:20px 22px}
.box small{display:block;font-size:20px;color:#6b6a64}.box b{font-size:34px}
.bar{height:22px;background:#e7e5de;border-radius:11px;overflow:hidden;margin:10px 0 4px}.bar i{display:block;height:100%;background:#2f5d50}
ul{list-style:none;padding:0;margin:0}li{font-size:25px;padding:12px 0;border-bottom:1px solid #ecebe6;line-height:1.45}
li.base{background:#e3eee9;border:3px solid #2f5d50;border-radius:14px;padding:14px 18px;margin:10px 0;font-weight:700}
li.bad{color:#b3401f}li .d{display:inline-block;width:170px;color:#2f5d50;font-weight:700}
table{width:100%;border-collapse:collapse;font-size:23px}th,td{padding:14px 10px;border-bottom:1px solid #ecebe6;text-align:left}th{color:#6b6a64;font-weight:600}
tr.best td{background:#e3eee9;font-weight:700}
.foot{margin-top:28px;font-size:18px;color:#9a9890;display:flex;justify-content:space-between}`;

function frame(inner, footLeft) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>${CSS}</style></head><body><div class="card" id="card">${inner}<div class="foot"><span>${esc(footLeft)}</span><span>개인 분석 · 투자 권유·법률 자문 아님</span></div></div></body></html>`;
}

function cardsFor(c) {
  const r = c.result;
  const a = r.analysis;
  const k = r.calc || {};
  const where = publicAddress(c.address);
  const [gText, gColor] = GRADE[r.grade] || GRADE['보류'];
  const foot = `${c.caseNo} · ${ymd(new Date())} 기준`;
  const out = [];

  // 1. 요약
  out.push({
    name: 'summary',
    caption: `${where} ${c.usage || ''} 경매 물건 요약`,
    html: frame(
      `<p class="k">${esc(c.court || '')} · 입찰일 ${esc(c.saleDate || '-')}</p>
       <p class="t"><span class="badge" style="background:${gColor}">${esc(r.grade)} ${esc(gText)}</span>${esc(where)} ${esc(c.usage || '')}${c.areaM2 ? ` ${esc(c.areaM2)}㎡` : ''}</p>
       <div class="row"><div class="box"><small>감정가</small><b>${eok(c.appraisal)}</b></div><div class="box"><small>최저가 (유찰 ${esc(c.failCount ?? 0)}회)</small><b>${eok(c.minPrice)}</b></div></div>
       <div class="bar"><i style="width:${Math.round(Math.min(1, k.minPriceRatio || 0) * 100)}%"></i></div>
       <p class="k">감정가 대비 ${pct(k.minPriceRatio)}</p>
       <ul>${(r.tags || []).slice(0, 5).map((t) => `<li class="${t.level === 'bad' ? 'bad' : ''}">#${esc(t.text)}</li>`).join('')}</ul>`,
      foot,
    ),
  });

  // 2. 권리 타임라인
  const ev = a.rights.map((x) => ({ d: toDate(x.date), base: x.status === '말소기준', bad: x.status === '인수' || x.status === '위험', text: `${x.type}${x.status === '말소기준' ? ' — 말소기준권리' : x.status === '인수' ? ' → 낙찰자 인수' : x.status === '위험' ? ' → 위험' : ' → 소멸'}` }));
  for (const t of a.tenants) if (t.moveIn) ev.push({ d: toDate(t.moveIn), bad: t.opposable, text: `${t.label} 전입 → 대항력 ${t.opposable ? '있음' : '없음'}` });
  ev.sort((x, y) => (x.d && y.d ? x.d - y.d : x.d ? -1 : 1));
  out.push({
    name: 'rights',
    caption: '권리관계 타임라인 (말소기준권리 위는 낙찰자가 떠안을 수 있어요)',
    html: frame(
      `<p class="k">권리관계 한눈에</p><p class="t">말소기준권리 선 위 = 떠안을 수 있음</p>
       <ul>${ev.map((e) => `<li class="${e.base ? 'base' : e.bad ? 'bad' : ''}"><span class="d">${e.d ? ymd(e.d) : '날짜 미상'}</span>${esc(e.text)}</li>`).join('')}</ul>
       <p class="k" style="margin-top:20px">${a.assumedAmount ? `낙찰자 인수 예상: 최저가 낙찰 시 ${won(a.assumedAmount)}${a.assumedAtRecommended != null ? ` / 계산가 낙찰 시 ${won(a.assumedAtRecommended)}` : ''}` : '등기부상 낙찰자가 떠안는 권리 없음 (서류 기준)'}</p>`,
      foot,
    ),
  });

  // 3. 입찰가 (제외 물건은 생략)
  if (k.bids && r.grade !== 'X') {
    out.push({
      name: 'bid',
      caption: '내 조건으로 계산한 입찰가 범위',
      html: frame(
        `<p class="k">내 조건으로 계산한 입찰가 (시세 ${eok(k.market.mid)} 기준)</p><p class="t">계산 입찰가 ${eok(k.bids.recommended)}</p>
         <div class="row"><div class="box"><small>보수</small><b>${eok(k.bids.conservative)}</b></div><div class="box"><small>상한 (넘으면 포기)</small><b>${eok(k.bids.ceiling)}</b></div></div>
         <div class="row"><div class="box"><small>입찰보증금</small><b>${eok(k.deposit)}</b></div><div class="box"><small>잔금일 필요 현금*</small><b>${eok(k.scenarios && k.scenarios.mid.cashNeeded)}</b></div></div>
         ${r.competition && r.competition.status === 'ok' ? `<p class="k">비슷한 물건 ${r.competition.count}건 평균 낙찰가율 ${pct(r.competition.avgRatio)} → 낙찰 가능성 ${esc(r.competition.chance || '-')}</p>` : ''}
         <p class="k">* 대출 ${pct(r.settings.buyer.loanRatio, 0)} 가정, 취득세·이전비·명도·수리비 포함 (추정)</p>`,
        foot,
      ),
    });
  }

  // 4. 활용법 비교
  const opts = (r.strategy && r.strategy.options) || [];
  if (opts.length && r.grade !== 'X') {
    out.push({
      name: 'strategy',
      caption: '낙찰받으면 어떻게 쓰는 게 나을까 — 매도·전세·월세·실거주 비교',
      html: frame(
        `<p class="k">같은 낙찰가 기준</p><p class="t">매도 · 전세 · 월세 · 실거주</p>
         <table><tr><th>방법</th><th>묶이는 돈</th><th>예상 이익</th><th>연수익률</th></tr>
         ${opts.map((o) => `<tr class="${o.key === r.strategy.best ? 'best' : ''}"><td>${o.key === r.strategy.best ? '★ ' : ''}${esc(o.name)}</td><td>${o.lockedCash < 0 ? '플피' : eok(o.lockedCash)}</td><td>${o.key === 'live' ? eok(o.profit) + ' 절약' : eok(o.profit)}</td><td>${o.annualRoi === Infinity ? '∞' : o.annualRoi == null ? '-' : pct(o.annualRoi)}</td></tr>`).join('')}</table>
         <p class="k" style="margin-top:16px">세금·이자·명도비 반영 추정 · 양도세 등은 세무사 확인</p>`,
        foot,
      ),
    });
  }

  // 5. 체크리스트
  out.push({
    name: 'check',
    caption: '입찰 전 꼭 확인할 것',
    html: frame(
      `<p class="k">입찰 전 체크리스트</p><p class="t">현장에서 꼭 확인할 것</p>
       <ul><li>✔ 매각물건명세서 최신본 · 변경/취하 여부 (입찰 전날)</li><li>✔ 주민센터 전입세대열람 — 명세서에 없는 전입자</li><li>✔ 관리사무소 체납관리비 (공용부분은 낙찰자 승계)</li><li>✔ 중개사 2곳 — 급매가 · 전세 · 월세 시세</li><li>✔ 경락잔금대출 가능 금액 · 금리 사전 상담</li>${a.questions.slice(0, 2).map((q) => `<li class="bad">❓ ${esc(q)}</li>`).join('')}</ul>`,
      foot,
    ),
  });
  return out;
}

// cards → PNG 파일들. 반환: [{name, path(ROOT 기준 상대경로), caption}]
async function render(c, outDir, root) {
  const { chromium } = require('playwright');
  fs.mkdirSync(outDir, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 960, height: 800 }, deviceScaleFactor: 1 });
  const files = [];
  try {
    for (const [i, card] of cardsFor(c).entries()) {
      await page.setContent(card.html, { waitUntil: 'load' });
      const file = path.join(outDir, `${i + 1}-${card.name}.png`);
      await page.locator('#card').screenshot({ path: file });
      files.push({ name: card.name, path: path.relative(root, file).split(path.sep).join('/'), caption: card.caption });
    }
  } finally {
    await browser.close();
  }
  return files;
}

module.exports = { cardsFor, render };
