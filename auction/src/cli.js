#!/usr/bin/env node
// 법원경매 툴 단일 진입점
//   node auction/src/cli.js demo                 샘플 3건으로 전체 흐름 체험 → 리포트(HTML) 생성
//   node auction/src/cli.js collect [옵션]       법원경매정보 순회·수집 (collect.js 옵션 그대로)
//   node auction/src/cli.js evaluate [파일...]   케이스 평가(권리분석·명도·계산·출구전략·등급) → 각 파일 "result"에 저장
//   node auction/src/cli.js report [--title 제목] workspace/cases 전체 → workspace/reports/*.md, *.html
//   node auction/src/cli.js budget [현금]        가진 현금으로 가능한 최대 낙찰가
//   node auction/src/cli.js new <사건번호>       빈 케이스 파일 만들기
const fs = require('fs');
const path = require('path');
const { PATHS, readJson, writeJson, config, won, eok, pct, listCaseFiles } = require('./lib/util');
const { evaluate } = require('./evaluate');
const { writeReport } = require('./report');
const { affordableBid } = require('./calc');

const REQUIRED = ['caseNo', 'court', 'saleDate', 'usage', 'address', 'appraisal', 'minPrice'];

function validate(c) {
  const miss = REQUIRED.filter((k) => c[k] == null || c[k] === '');
  for (const k of ['appraisal', 'minPrice']) if (c[k] != null && typeof c[k] !== 'number') miss.push(`${k}(숫자 아님 — 원 단위 숫자로)`);
  if (c.appraisal && c.minPrice && c.minPrice > c.appraisal) miss.push('최저가가 감정가보다 큼(단위 확인)');
  return miss;
}

function evalFiles(files, criteria) {
  const out = [];
  for (const f of files) {
    const c = readJson(f);
    const miss = validate(c);
    if (miss.length) console.log(`⚠ ${path.basename(f)} 필수값 문제: ${miss.join(', ')}`);
    const { result: _old, ...clean } = c;
    const result = evaluate(clean, criteria);
    writeJson(f, { ...clean, result });
    const k = result.calc;
    const best = (result.strategy.options || []).find((o) => o.key === result.strategy.best);
    console.log(`\n[${result.grade}] ${c.caseNo}  ${c.address || ''}`);
    console.log(`  사유: ${result.reasons.join(' · ')}`);
    console.log(`  최저가 ${won(c.minPrice)} (${pct(k.minPriceRatio)}) / 인수예상 ${won(result.analysis.assumedAmount)} / 명도: ${result.eviction.type}`);
    if (result.grade === 'X') console.log('  입찰 비추천 (제외 물건)');
    else if (k.bids) console.log(`  입찰가 보수 ${won(k.bids.conservative)} | 추천 ${won(k.bids.recommended)} | 상한 ${won(k.bids.ceiling)} / 잔금일 현금 ${won(k.scenarios.mid.cashNeeded)}`);
    if (best && result.grade !== 'X') console.log(`  추천 방법: ${best.name} → 예상 이익 ${won(best.profit)}`);
    if (result.analysis.questions.length) console.log(`  ❓ ${result.analysis.questions.join(' / ')}`);
    out.push({ ...clean, result });
  }
  return out;
}

function main() {
  const [cmd, ...args] = process.argv.slice(2);
  const criteria = config('criteria.json');
  const flag = (k) => {
    const i = args.indexOf(k);
    return i >= 0 ? args[i + 1] : null;
  };

  switch (cmd) {
    case 'demo': {
      const dir = path.join(PATHS.workspace, 'demo');
      fs.rmSync(dir, { recursive: true, force: true });
      fs.mkdirSync(dir, { recursive: true });
      for (const f of fs.readdirSync(PATHS.samples)) fs.copyFileSync(path.join(PATHS.samples, f), path.join(dir, f));
      const cases = evalFiles(listCaseFiles(dir), criteria);
      const r = writeReport(cases, criteria, dir, { title: '샘플 체험 (가상 물건)', slug: 'demo' });
      console.log(`\n✅ 데모 리포트: ${path.relative(PATHS.root, r.html)}  (브라우저로 열기)`);
      break;
    }
    case 'collect': {
      process.argv = [process.argv[0], path.join(__dirname, 'collect.js'), ...args];
      require('./collect');
      break;
    }
    case 'evaluate': {
      const files = args.filter((a) => !a.startsWith('--'));
      const list = files.length ? files : listCaseFiles(PATHS.cases);
      if (!list.length) return console.log('평가할 케이스가 없습니다 (auction/workspace/cases/*.json)');
      evalFiles(list, criteria);
      break;
    }
    case 'report': {
      const files = listCaseFiles(PATHS.cases);
      if (!files.length) return console.log('케이스가 없습니다. 먼저 evaluate 하세요.');
      const cases = files.map(readJson);
      const stale = cases.filter((c) => !c.result).map((c) => c.caseNo);
      const ready = stale.length ? evalFiles(files, criteria) : cases;
      const r = writeReport(ready, criteria, PATHS.reports, { title: flag('--title') || undefined });
      console.log(`✅ 리포트: ${path.relative(PATHS.root, r.md)}\n          ${path.relative(PATHS.root, r.html)}`);
      break;
    }
    case 'budget': {
      const cash = Number(args[0] || criteria.cashAvailable);
      const b = affordableBid(cash, { buyer: criteria.buyer });
      console.log(`현금 ${won(cash)} · 대출 ${pct(criteria.buyer.loanRatio)} → 최대 낙찰가 약 ${eok(b)} (${won(b)})`);
      break;
    }
    case 'new': {
      const no = args[0];
      if (!no) return console.log('사용: new <사건번호>');
      const f = path.join(PATHS.cases, `${no.replace(/[^\w가-힣-]/g, '_')}.json`);
      if (fs.existsSync(f)) return console.log(`이미 있음: ${f}`);
      const t = readJson(path.join(PATHS.samples, 'sample-B.json'));
      for (const k of Object.keys(t)) if (!k.startsWith('_')) t[k] = Array.isArray(t[k]) ? [] : typeof t[k] === 'object' ? {} : null;
      delete t._sample;
      t.caseNo = no;
      writeJson(f, t);
      console.log(`📝 ${path.relative(PATHS.root, f)}`);
      break;
    }
    default:
      console.log(fs.readFileSync(__filename, 'utf8').split('\n').slice(1, 8).join('\n').replace(/^\/\/ ?/gm, ''));
  }
}

main();
