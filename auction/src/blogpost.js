// 경매 분석 → 네이버 블로그 초안 JSON (scripts/naver_draft.js 형식) + 카드 이미지
// 사실·숫자는 분석 결과 그대로. 주소는 동까지만. 임시저장까지만 하고 발행은 사람이 한다.
const fs = require('fs');
const path = require('path');
const { PATHS, eok, won, pct, ymd } = require('./lib/util');
const { publicAddress } = require('./content');
const cards = require('./cards');

const DISCLAIMER = '공개된 법원경매 자료를 바탕으로 한 개인 분석이에요.\n투자 권유나 법률 자문이 아니고, 숫자는 제 조건으로 계산한 추정치예요.\n입찰 전에는 꼭 원문 서류와 현장을 직접 확인하세요.';

function keyword(c) {
  const parts = publicAddress(c.address).split(' ');
  const sigungu = parts.slice(1).find((p) => /[시군구]$/.test(p)) || parts[0] || '';
  const usage = String(c.usage || '부동산').replace('다세대', '빌라');
  return { sigungu, dong: parts[parts.length - 1] || '', usage, kw: `${sigungu} ${usage} 경매`.trim() };
}

function fitTitle(t, fallbackTail) {
  let s = t.replace(/\s+/g, ' ').trim();
  if (s.length > 32) s = s.replace(/\s\S+동\s/, ' ');
  if (s.length < 25 && fallbackTail) s = `${s} ${fallbackTail}`;
  return s.slice(0, 40);
}

// opts.series / opts.episode: 시리즈 글 (예: "1억으로 경매" 3번째)
function build(c, images = [], opts = {}) {
  const r = c.result;
  const a = r.analysis;
  const k = r.calc || {};
  const { sigungu, dong, usage, kw } = keyword(c);
  const img = (name) => images.find((x) => x.name === name);
  const X = r.grade === 'X';
  const kept = a.rights.filter((x) => x.status === '인수');
  const risky = a.rights.filter((x) => x.status === '위험');
  const opp = a.tenants.filter((t) => t.opposable);
  const best = ((r.strategy || {}).options || []).find((o) => o.key === r.strategy.best);
  const blocks = [];
  const text = (...lines) => blocks.push({ type: 'text', text: lines.filter(Boolean).join('\n') });
  const image = (name) => img(name) && blocks.push({ type: 'image', path: img(name).path, caption: img(name).caption });

  const title = X
    ? fitTitle(`${kw} ${pct(k.minPriceRatio, 0)}까지 떨어져도 피해야 하는 이유`, '')
    : fitTitle(`${kw} ${dong} 물건 권리분석과 입찰가 계산`, '정리');

  // 도입 (Yes-set) + 솔직함 한 줄
  text(
    `${kw} 찾다 보면 감정가보다 한참 싼 물건이 눈에 들어오죠.`,
    `그런데 싸다고 덜컥 들어갔다가 보증금을 떠안거나 명도에 몇 달씩 묶이는 경우도 많고요.`,
    `오늘은 ${sigungu} ${dong} ${usage} 한 건을 서류부터 숫자까지 끝까지 따라가 봤어요.`,
    X ? `결론부터 말씀드리면, 이 물건은 저라면 넘깁니다.` : `결론부터 말씀드리면, 등급은 ${r.grade}(${{ A: '입찰 검토', B: '조건부', C: '관망' }[r.grade] || r.grade})예요.`,
  );
  text(
    opts.series ? `'${opts.series}' 시리즈 ${opts.episode || 1}번째 물건이에요.` : null,
    opts.series && r.settings.cashAvailable ? `현금 ${eok(r.settings.cashAvailable)}(대출 ${pct(r.settings.buyer.loanRatio, 0)} 가정)으로 정말 가능한지 따져볼게요.` : null,
    '좋은 점만 쓰지 않을게요.',
    '서류를 직접 읽고 계산기로 돌린 결과를 그대로 옮깁니다.',
  );
  image('summary');

  blocks.push({ type: 'subtitle', text: `${kw} 기본 정보` });
  text(
    `✔ 사건번호 — ${c.caseNo} (${c.court || '-'})`,
    `✔ 물건 — ${usage} ${c.areaM2 ? c.areaM2 + '㎡' : ''} · ${publicAddress(c.address)}`,
    `✔ 감정가 — ${eok(c.appraisal)}`,
    `✔ 최저가 — ${eok(c.minPrice)} (감정가의 ${pct(k.minPriceRatio)}, 유찰 ${c.failCount ?? 0}회)`,
    `✔ 입찰일 — ${c.saleDate || '-'}`,
  );
  blocks.push({ type: 'quote', text: r.reasons[0] || '서류 기준으로 정리한 결과예요' });

  blocks.push({ type: 'subtitle', text: '권리분석 — 말소기준권리와 임차인' });
  image('rights');
  text(
    a.baseRight ? `말소기준권리는 ${a.baseRight.date} ${a.baseRight.type}이에요.` : '말소기준권리는 서류 확인이 더 필요해요.',
    '이 날짜보다 앞선 권리는 낙찰자가 떠안을 수 있고, 뒤에 있는 권리는 낙찰로 정리돼요.',
    kept.length ? `이 물건은 말소기준보다 앞선 권리가 있어요: ${kept.map((x) => x.type).join(', ')}.` : '말소기준보다 앞선 권리는 보이지 않아요.',
    risky.length ? `순위와 상관없이 위험한 권리 신고도 있어요: ${risky.map((x) => x.type).join(', ')}.` : null,
  );
  if (a.tenants.length) {
    text(
      opp.length ? `먼저 살던 세입자(대항력 있는 임차인)가 ${opp.length}명 있어요.` : '세입자는 있지만 대항력이 없어서 보증금을 떠안지는 않아요.',
      opp.length ? `낙찰가가 낮으면 배당이 모자라 보증금 일부를 낙찰자가 돌려줘야 해요.` : '대신 이사 협의(명도)는 필요해요.',
      a.assumedAmount ? `계산해 보니 최저가에 낙찰되면 ${eok(a.assumedAmount)}을 떠안지만, ${a.assumedAtRecommended === 0 ? '계산가에 낙찰되면 세입자가 전액 배당받아 떠안을 돈이 없어요.' : `계산가에 낙찰돼도 ${eok(a.assumedAtRecommended ?? a.assumedAmount)}은 떠안아요.`}` : null,
    );
  } else {
    text(c.tenantsUnknown ? '점유자가 확인되지 않아 전입세대열람이 꼭 필요해요.' : '서류상 임차인은 없고 소유자가 사는 집이에요.');
  }
  blocks.push({ type: 'quote', text: kept.length || risky.length ? '싼 데는 이유가 있다 — 이 물건은 권리관계가 핵심' : opp.length ? '대항력 임차인은 낙찰가에 따라 떠안는 돈이 달라져요' : '권리관계는 깔끔한 편, 관건은 시세와 경쟁' });
  blocks.push({ type: 'divider' });

  if (opts.series && !X && k.scenarios && r.settings.cashAvailable) {
    const need = k.scenarios.mid.cashNeeded;
    blocks.push({ type: 'subtitle', text: `현금 ${eok(r.settings.cashAvailable)}으로 가능할까` });
    text(
      `입찰 당일엔 보증금 ${eok(k.deposit)}만 있으면 돼요.`,
      `낙찰되면 잔금일에 대출 ${pct(r.settings.buyer.loanRatio, 0)}를 빼고 세금·이전비·명도·수리비까지 약 ${eok(need)}이 필요해요.`,
      need <= r.settings.cashAvailable ? `${eok(r.settings.cashAvailable - need)} 정도 여유가 남는 계산이에요.` : `${eok(need - r.settings.cashAvailable)}이 모자라서 대출 한도를 먼저 확인해야 해요.`,
      '대출 비율은 소득·주택 수에 따라 달라지니 은행 상담값으로 다시 계산해 보세요.',
    );
  }
  if (!X && k.bids) {
    blocks.push({ type: 'subtitle', text: `${kw} 입찰가는 얼마가 적당할까` });
    image('bid');
    text(
      `시세는 ${k.market.source ? `"${k.market.source}"` : '확인한 자료'} 기준으로 ${eok(k.market.mid)} 정도로 봤어요.`,
      `취득세·이자·명도비·수리비까지 넣고 계산하면 ${eok(k.bids.recommended)} 근처가 제 계산값이에요.`,
      `${eok(k.bids.ceiling)}을 넘기면 남는 게 거의 없어서 저라면 거기서 멈춥니다.`,
      r.competition && r.competition.status === 'ok' ? `비슷한 물건 ${r.competition.count}건은 감정가의 평균 ${pct(r.competition.avgRatio)}에 낙찰됐어요.` : null,
    );
    if (best) {
      blocks.push({ type: 'subtitle', text: '낙찰받으면 어떻게 쓰는 게 나을까' });
      image('strategy');
      text(
        '같은 낙찰가로 매도·전세·월세·실거주를 나란히 비교해 봤어요.',
        `제 조건에서 가장 나은 방법은 "${best.name}" — ${best.key === 'live' ? `급매로 사는 것보다 ${eok(best.profit)} 아끼는` : `예상 이익 ${eok(best.profit)}`} 정도예요.`,
        '대출 비율·주택 수·보유 기간에 따라 순서가 바뀌니 본인 조건으로 꼭 다시 계산해 보세요.',
      );
    }
    blocks.push({ type: 'divider' });
  }

  blocks.push({ type: 'subtitle', text: '단점과 주의할 점' });
  const cons = [
    ...a.questions.slice(0, 3).map((q) => `✔ ${q}`),
    '✔ 경매는 집 안을 못 보고 사요 — 수리비 여유를 두세요',
    r.eviction ? `✔ 명도: ${r.eviction.type} — 약 ${r.eviction.months}개월 예상` : null,
  ].filter(Boolean);
  text(...cons);
  image('check');
  blocks.push({ type: 'quote', text: '입찰 전날 변경·취하 여부와 명세서 최신본 확인은 필수' });

  text(
    `오늘은 ${kw} 물건 하나를 권리분석부터 입찰가까지 정리해 봤어요.`,
    X ? '숫자만 보면 싸 보여도 권리관계 때문에 피해야 하는 물건도 있다는 걸 기억해 주세요.' : '관심 있으시면 임장 가서 위 체크리스트부터 확인해 보세요.',
    '',
    DISCLAIMER,
  );

  const tags = [...new Set([opts.series && opts.series.replace(/\s/g, ''), `${sigungu}${usage}경매`, `${sigungu}경매`, `${usage}경매`, '법원경매', '부동산경매', '경매권리분석', '말소기준권리', X ? '경매주의물건' : '경매입찰가', dong && `${dong}${usage}`].filter(Boolean).map((t) => t.replace(/\s/g, '')))].slice(0, 10);

  return {
    title,
    mainKeyword: kw,
    persona: `${sigungu} 근처 ${usage} 경매를 알아보는 30~40대, 권리분석이 어려워 검색 중`,
    sponsored: false,
    tags,
    place: null,
    video: null,
    blocks,
    _auction: { caseId: c._id, caseNo: c.caseNo, grade: r.grade, createdAt: new Date().toISOString() },
  };
}

// 카드 이미지 만들고 drafts/YYYYMMDD-auction-<id>.json 저장
async function createDraft(c, opts = {}) {
  if (!c.result) throw new Error('분석된 물건이 아니에요');
  const id = c._id || String(c.caseNo).replace(/[^\w가-힣-]/g, '_');
  const imgDir = path.join(PATHS.root, 'drafts', 'auction', id);
  const images = await cards.render(c, imgDir, PATHS.root);
  const draft = build({ ...c, _id: id }, images, opts);
  const file = path.join(PATHS.root, 'drafts', `${ymd(new Date()).replace(/-/g, '')}-auction-${id}.json`);
  fs.writeFileSync(file, JSON.stringify(draft, null, 2));
  return { file, rel: path.relative(PATHS.root, file).split(path.sep).join('/'), draft, images };
}

function stats(draft) {
  const body = draft.blocks.filter((b) => b.type === 'text' || b.type === 'quote' || b.type === 'subtitle').map((b) => b.text).join('');
  const count = (re) => (body.match(re) || []).length;
  return {
    titleLen: draft.title.length,
    chars: body.replace(/\s/g, '').length,
    images: draft.blocks.filter((b) => b.type === 'image').length,
    quotes: draft.blocks.filter((b) => b.type === 'quote').length,
    keywordCount: count(new RegExp(draft.mainKeyword.replace(/\s/g, '\\s?'), 'g')),
  };
}

function preview(draft) {
  return [
    `제목: ${draft.title}`,
    `태그: ${draft.tags.map((t) => '#' + t).join(' ')}`,
    '',
    ...draft.blocks.map((b) => (b.type === 'text' ? b.text : b.type === 'subtitle' ? `\n【소제목】 ${b.text}` : b.type === 'quote' ? `【인용구】 ${b.text}` : b.type === 'image' ? `【이미지】 ${b.caption}` : '────────')),
  ].join('\n');
}

// 경매 글을 올릴 네이버 세션 폴더 (설정 → 네이버 블로그 선택)
const PROFILES = { main: 'naver-profile', auction: 'naver-profile-auction' };
function blogProfile() {
  const { readLocal } = require('./geocode');
  return PROFILES[readLocal().blogTarget] || PROFILES.main;
}

module.exports = { build, createDraft, preview, stats, keyword, blogProfile };
