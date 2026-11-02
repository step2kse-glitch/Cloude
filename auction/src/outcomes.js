// 내 AI 적정가 적중률 (요이땅 LAB의 개인판): 추천 입찰가 vs 실제 낙찰가
// 케이스에 outcome {result:'낙찰'|'유찰'|'변경'|'취하', winningBid, bidders, date, myBid, won} 을 기록하면 집계된다.

function stats(cases) {
  const rows = [];
  for (const c of cases) {
    const o = c.outcome;
    const rec = c.result && c.result.calc && c.result.calc.bids && c.result.calc.bids.recommended;
    if (!o || o.result !== '낙찰' || !o.winningBid || !rec) continue;
    const err = rec / o.winningBid - 1; // +면 추천가가 높게, -면 낮게
    rows.push({ caseNo: c.caseNo, address: c.address, sample: !!c._sample, recommended: rec, winningBid: o.winningBid, bidders: o.bidders ?? null, err, date: o.date || c.saleDate, grade: c.result.grade });
  }
  const n = rows.length;
  const within = (p) => (n ? rows.filter((r) => Math.abs(r.err) <= p).length : 0);
  const mae = n ? rows.reduce((s, r) => s + Math.abs(r.err), 0) / n : null;
  const mean = n ? rows.reduce((s, r) => s + r.err, 0) / n : null;
  const sd = n > 1 ? Math.sqrt(rows.reduce((s, r) => s + (r.err - mean) ** 2, 0) / (n - 1)) : null;
  const recorded = cases.filter((c) => c.outcome && c.outcome.result).length;
  const mine = cases.filter((c) => c.outcome && c.outcome.myBid);
  return {
    n,
    recorded,
    within5: within(0.05),
    within10: within(0.1),
    within15: within(0.15),
    within20: within(0.2),
    mae,
    bias: mean,
    sd,
    low: rows.filter((r) => r.err < 0).length,
    high: rows.filter((r) => r.err > 0).length,
    myBids: mine.length,
    myWins: mine.filter((c) => c.outcome.won).length,
    rows: rows.sort((a, b) => String(b.date).localeCompare(String(a.date))),
    hint:
      n >= 5 && mean != null
        ? mean < -0.05
          ? `추천가가 실제 낙찰가보다 평균 ${(-mean * 100).toFixed(1)}% 낮아요 → 경쟁이 센 지역이면 목표 마진(설정)을 조금 낮추는 걸 검토`
          : mean > 0.05
            ? `추천가가 실제 낙찰가보다 평균 ${(mean * 100).toFixed(1)}% 높아요 → 더 낮게 써도 낙찰될 여지`
            : '추천가가 실제 낙찰가와 평균적으로 비슷해요'
        : '낙찰 결과가 5건 이상 쌓이면 보정 힌트를 드려요',
  };
}

module.exports = { stats };
