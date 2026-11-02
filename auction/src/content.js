// 경매 콘텐츠 초안: 분석 결과 → 블로그 글 / 유튜브 쇼츠 / 유튜브 롱폼 원고 (사실만, 개인정보 제거)
// 여기서 만드는 건 "사실 뼈대 초안". 말투 다듬기는 Claude(/auction 콘텐츠)가 하고, 발행은 사람이.
const { won, eok, pct } = require('./lib/util');
const { tags } = require('./tags');

// 동·호수·번지 제거: "경기도 화성시 ○○동 …" → "경기도 화성시 ○○동"
function publicAddress(addr) {
  const parts = String(addr || '').split(/\s+/).filter(Boolean);
  const out = [];
  for (const p of parts) {
    if (/\d/.test(p) || /[()]/.test(p)) break;
    out.push(p);
    if (/[동읍면리가]$/.test(p) && out.length >= 3) break;
  }
  return out.join(' ');
}

const DISCLAIMER = '※ 공개된 법원경매 자료를 정리한 개인 분석이며 투자 권유나 법률 자문이 아닙니다. 입찰 전 원문 서류와 현장을 꼭 확인하세요.';

function facts(c) {
  const r = c.result || {};
  const a = r.analysis || { rights: [], tenants: [] };
  const k = r.calc || {};
  const where = publicAddress(c.address);
  const kept = a.rights.filter((x) => x.status === '인수').map((x) => x.type);
  const opp = a.tenants.filter((t) => t.opposable);
  const best = ((r.strategy || {}).options || []).find((o) => o.key === (r.strategy || {}).best);
  return { r, a, k, where, kept, opp, best, tagText: tags(c, a).map((t) => '#' + t.text).join(' ') };
}

function blog(c) {
  const { r, a, k, where, kept, opp, best, tagText } = facts(c);
  const title = `${where} ${c.usage || ''} 경매 ${pct(k.minPriceRatio)}까지 내려온 물건 권리분석`.replace(/\s+/g, ' ').trim();
  const lines = [];
  lines.push(`# ${title}`, '');
  lines.push(`${where}에 ${c.usage || '물건'} 경매가 하나 나왔어요.`, `감정가 ${eok(c.appraisal)}인데 유찰 ${c.failCount || 0}회로 최저가가 ${eok(c.minPrice)}까지 내려왔습니다.`, '결론부터 말하면 등급은 **' + (r.grade || '-') + '** — ' + (r.reasons || []).join(', ') + '.', '');
  lines.push('## 기본 정보', `✔ 용도·면적 — ${c.usage || '-'} ${c.areaM2 ? c.areaM2 + '㎡' : ''}`, `✔ 감정가 — ${won(c.appraisal)}`, `✔ 최저가 — ${won(c.minPrice)} (${pct(k.minPriceRatio)})`, `✔ 입찰일 — ${c.saleDate || '-'}`, '');
  lines.push('## 권리분석 핵심', a.baseRight ? `말소기준권리는 ${a.baseRight.date} ${a.baseRight.type}입니다.` : '말소기준권리는 서류 확인이 더 필요해요.');
  lines.push(kept.length ? `말소기준보다 앞선 ${kept.join(', ')}이(가) 있어 낙찰자가 떠안을 수 있어요. 이 부분이 이 물건의 가장 큰 위험입니다.` : '말소기준보다 앞선 권리는 없어서 등기부상 권리는 낙찰로 정리돼요.');
  if (opp.length) lines.push(`대항력 있는 임차인이 ${opp.length}명 있어요. 추천가로 낙찰되면 떠안을 보증금은 ${won(a.assumedAtRecommended ?? a.assumedAmount)}로 계산됐어요.`);
  else if (a.tenants.length) lines.push('임차인은 있지만 대항력이 없어 보증금을 떠안지 않아요. 대신 명도(이사 협의)는 필요합니다.');
  lines.push('', `> ${kept.length || opp.length ? '권리관계가 핵심인 물건 — 서류 원문 확인이 먼저' : '권리관계는 깔끔한 편 — 관건은 시세와 경쟁'}`, '');
  if (k.bids) {
    lines.push('## 얼마에 써볼까', `시세 기준(${k.market.source || '출처 확인 필요'})으로 계산하면 추천 입찰가는 ${eok(k.bids.recommended)}, 이 이상은 손해 구간인 상한은 ${eok(k.bids.ceiling)}이에요.`, `입찰보증금은 ${won(k.deposit)}, 잔금일에 필요한 현금은 대출 가정에 따라 약 ${eok(k.scenarios && k.scenarios.mid.cashNeeded)}입니다.`);
    if (r.competition && r.competition.status === 'ok') lines.push(`비슷한 물건 ${r.competition.count}건의 평균 낙찰가율은 ${pct(r.competition.avgRatio)} — 추천가의 낙찰 가능성은 "${r.competition.chance}"이에요.`);
    lines.push('');
  }
  if (best) lines.push('## 낙찰받으면 어떻게 쓸까', `비교해 보니 ${best.name}이(가) 가장 나았어요. 예상 이익 ${eok(best.profit)} (세금·이자·명도비 반영, 추정).`, '');
  lines.push('## 단점·주의할 점', ...(a.questions || []).slice(0, 3).map((q) => `✔ ${q}`), '✔ 경매는 내부를 못 보고 사요 — 수리비 여유를 두세요', '');
  lines.push(DISCLAIMER, '', tagText);
  return { title, text: lines.join('\n') };
}

function shorts(c) {
  const { r, k, where, kept, opp } = facts(c);
  const hook = kept.length ? '싸다고 덤볐다간 집을 잃을 수 있는 경매 물건' : opp.length ? '세입자 보증금을 떠안을 수도 있는 경매 물건' : `감정가의 ${pct(k.minPriceRatio)}까지 떨어진 경매 물건`;
  const scenes = [
    { t: '0~3초', say: hook, screen: `${where} ${c.usage || ''} · 최저가 ${eok(c.minPrice)}` },
    { t: '3~15초', say: `감정가 ${eok(c.appraisal)}, 유찰 ${c.failCount || 0}번. 지금 최저가는 ${eok(c.minPrice)}이에요.`, screen: '감정가 → 최저가 막대' },
    { t: '15~35초', say: kept.length ? `문제는 말소기준보다 앞선 ${kept.join(', ')}. 이건 낙찰돼도 안 지워져요.` : opp.length ? '먼저 살던 세입자가 있어요. 낙찰가에 따라 보증금을 떠안을 수도 있어요.' : '권리관계는 깔끔해요. 남은 건 시세와 경쟁이에요.', screen: '권리 타임라인 (말소기준 선)' },
    { t: '35~50초', say: k.bids && r.grade !== 'X' ? `제 계산으로는 ${eok(k.bids.recommended)} 정도가 적정, ${eok(k.bids.ceiling)} 넘으면 손해예요.` : '저라면 이 물건은 넘깁니다.', screen: '추천가 / 상한 카드' },
    { t: '50~60초', say: '입찰 전엔 꼭 원문 서류와 현장 확인하세요. 다음 물건도 분석해 드릴게요.', screen: '구독·저장 유도' },
  ];
  return { title: `${hook} | ${where}`, scenes, caption: `${DISCLAIMER}` };
}

function longform(c) {
  const { r, k, where } = facts(c);
  const sections = [
    ['오프닝 (30초)', `오늘은 ${where} ${c.usage || ''} 경매 물건 하나를 처음부터 끝까지 분석해 볼게요. 등급은 ${r.grade || '-'}.`],
    ['물건 소개 (1분)', `감정가 ${eok(c.appraisal)}, 최저가 ${eok(c.minPrice)}(${pct(k.minPriceRatio)}), 유찰 ${c.failCount || 0}회, 입찰일 ${c.saleDate || '-'}.`],
    ['권리분석 (2분)', '등기부를 날짜순으로 놓고 말소기준권리 선을 긋는다 → 선 위 권리·대항력 임차인 확인 → 명세서 비고 원문 읽기.'],
    ['입찰가 계산 (1분 30초)', k.bids ? `시세 ${eok(k.market.mid)} 기준 추천 ${eok(k.bids.recommended)}, 상한 ${eok(k.bids.ceiling)}. 취득세·이자·명도비까지 넣은 계산.` : '시세 확인 전이라 계산 보류.'],
    ['출구전략 (1분)', '매도·전세·월세·실거주를 같은 낙찰가로 비교한 표 보여주기.'],
    ['체크리스트·마무리 (30초)', '임장 때 확인할 것: 관리비 체납, 전입세대열람, 중개사 시세. ' + DISCLAIMER],
  ];
  return { title: `[경매 분석] ${where} ${c.usage || ''} — 권리분석부터 입찰가까지`, sections };
}

function build(c, type) {
  if (type === 'shorts') return shorts(c);
  if (type === 'longform') return longform(c);
  return blog(c);
}

function toText(type, d) {
  if (type === 'shorts') return [`제목: ${d.title}`, '', ...d.scenes.map((s) => `[${s.t}] ${s.say}\n  화면: ${s.screen}`), '', d.caption].join('\n');
  if (type === 'longform') return [`제목: ${d.title}`, '', ...d.sections.map(([h, b]) => `■ ${h}\n${b}`)].join('\n\n');
  return d.text;
}

module.exports = { build, toText, publicAddress };
