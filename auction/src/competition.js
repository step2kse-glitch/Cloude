// 낙찰가율로 본 경쟁력: 비슷한 물건이 감정가의 몇 %에 낙찰됐나 → 추천 입찰가의 낙찰 가능성
// 근거: 케이스의 auctionComps(출처 있는 낙찰 사례) + 내가 기록한 낙찰 결과(outcomes) 중 같은 시군구·용도
const { toDate, ymd } = require('./lib/util');

const region = (addr) => {
  const m = String(addr || '').match(/(\S+[시도])\s+(\S+[시군구])/);
  return m ? `${m[1]} ${m[2]}` : null;
};

function compsFor(c, allCases = []) {
  const own = (c.auctionComps || []).filter((x) => x.appraisal && x.winningBid);
  const reg = region(c.address);
  const fromOutcomes = allCases
    .filter((o) => o.caseNo !== c.caseNo && o.outcome && o.outcome.winningBid && o.appraisal && region(o.address) === reg && o.usage === c.usage)
    .map((o) => ({ caseNo: o.caseNo, date: o.outcome.date || o.saleDate, appraisal: o.appraisal, winningBid: o.outcome.winningBid, bidders: o.outcome.bidders, source: '내 낙찰 결과 기록' }));
  return [...own, ...fromOutcomes].map((x) => ({ ...x, ratio: x.winningBid / x.appraisal }));
}

function analyzeCompetition(c, bids, allCases) {
  const comps = compsFor(c, allCases);
  if (!comps.length) {
    return { status: 'none', note: '낙찰 사례 없음 — 같은 단지·인근 최근 낙찰가율을 찾아 auctionComps 에 넣으면 낙찰 가능성을 계산합니다' };
  }
  // 최근 사례에 가중치 (1년 지나면 절반)
  const now = Date.now();
  let wsum = 0;
  let rsum = 0;
  for (const x of comps) {
    const d = toDate(x.date);
    const ageY = d ? Math.max(0, (now - d) / (365 * 86400000)) : 1;
    const w = Math.pow(0.5, ageY);
    wsum += w;
    rsum += w * x.ratio;
  }
  const avgRatio = rsum / wsum;
  const ratios = comps.map((x) => x.ratio).sort((p, q) => p - q);
  const expected = Math.round((c.appraisal * avgRatio) / 1000) * 1000;
  const rec = bids && bids.recommended;
  let chance = null;
  let advice;
  if (rec) {
    const gap = rec / expected - 1;
    chance = gap >= 0.02 ? '높음' : gap >= -0.03 ? '보통' : '낮음';
    advice =
      chance === '높음'
        ? '비슷한 물건 낙찰가보다 높게 써서 낙찰 가능성이 높아요 (더 낮춰도 되는지 검토)'
        : chance === '보통'
          ? '비슷한 물건 낙찰가 근처 — 경쟁자 수에 따라 갈려요'
          : bids.ceiling >= expected
            ? `추천가로는 낙찰이 어려울 수 있어요. 상한(${Math.round(bids.ceiling / 1e4).toLocaleString()}만) 안에서 예상 낙찰가(${Math.round(expected / 1e4).toLocaleString()}만) 근처까지 올릴지 결정하세요`
            : '예상 낙찰가가 내 상한보다 높아요 — 무리해서 따라가지 말고 다음 물건으로';
  }
  return {
    status: 'ok',
    count: comps.length,
    avgRatio,
    minRatio: ratios[0],
    maxRatio: ratios[ratios.length - 1],
    expectedWinningBid: expected,
    chance,
    advice,
    comps: comps.map((x) => ({ caseNo: x.caseNo, date: x.date ? ymd(toDate(x.date)) : null, ratio: x.ratio, winningBid: x.winningBid, bidders: x.bidders ?? null, source: x.source || null })),
  };
}

module.exports = { analyzeCompetition, region };
