#!/usr/bin/env node
// 법원경매 툴 단일 진입점
//   node auction/src/cli.js web [--lan] [--port 4747]  웹 화면 (가장 쉬운 사용법)
//   node auction/src/cli.js demo                 샘플로 전체 흐름 체험 → 리포트(HTML) 생성
//   node auction/src/cli.js collect [옵션]       법원경매정보 순회·수집 (collect.js 옵션 그대로)
//   node auction/src/cli.js evaluate [파일...]   케이스 평가(권리분석·명도·계산·출구전략·등급) → 각 파일 "result"에 저장
//   node auction/src/cli.js report [--title 제목] workspace/cases 전체 → workspace/reports/*.md, *.html
//   node auction/src/cli.js budget [현금]        가진 현금으로 가능한 최대 낙찰가
//   node auction/src/cli.js new <사건번호>       빈 케이스 파일 만들기
//   node auction/src/cli.js verify <id>          <id>.check.json(두 번째 추출본)과 교차검증
//   node auction/src/cli.js content <id> [blog|shorts|longform]  콘텐츠 사실 초안 출력
//   node auction/src/cli.js ics [--all]          관심물건(또는 전체) 일정 → workspace/auction.ics
const fs = require('fs');
const path = require('path');
const { PATHS, readJson, writeJson, config, won, eok, pct, listCaseFiles } = require('./lib/util');
const store = require('./store');
const { writeReport } = require('./report');
const { verify } = require('./verify');
const content = require('./content');
const calendar = require('./calendar');
const { stats } = require('./outcomes');
const { affordableBid } = require('./calc');

const REQUIRED = ['caseNo', 'court', 'saleDate', 'usage', 'address', 'appraisal', 'minPrice'];

function validate(c) {
  const miss = REQUIRED.filter((k) => c[k] == null || c[k] === '');
  for (const k of ['appraisal', 'minPrice']) if (c[k] != null && typeof c[k] !== 'number') miss.push(`${k}(숫자 아님 — 원 단위 숫자로)`);
  if (c.appraisal && c.minPrice && c.minPrice > c.appraisal) miss.push('최저가가 감정가보다 큼(단위 확인)');
  return miss;
}

function print(cases) {
  for (const c of cases) {
    const miss = validate(c);
    const result = c.result;
    const k = result.calc;
    const best = (result.strategy.options || []).find((o) => o.key === result.strategy.best);
    if (miss.length) console.log(`⚠ ${c._id}.json 필수값 문제: ${miss.join(', ')}`);
    console.log(`\n[${result.grade}] ${c.caseNo}  ${c.address || ''}`);
    console.log(`  사유: ${result.reasons.join(' · ')}`);
    console.log(`  태그: ${result.tags.map((t) => '#' + t.text).join(' ')}`);
    console.log(`  최저가 ${won(c.minPrice)} (${pct(k.minPriceRatio)}) / 인수예상 ${won(result.analysis.assumedAmount)} / 명도: ${result.eviction.type}`);
    if (result.grade === 'X') console.log('  입찰 비추천 (제외 물건)');
    else if (k.bids) console.log(`  입찰가 보수 ${won(k.bids.conservative)} | 추천 ${won(k.bids.recommended)} | 상한 ${won(k.bids.ceiling)} / 잔금일 현금 ${won(k.scenarios.mid.cashNeeded)}`);
    if (result.competition.status === 'ok') console.log(`  낙찰가율 ${pct(result.competition.avgRatio)} (${result.competition.count}건) → 낙찰 가능성 ${result.competition.chance || '-'}`);
    if (best && result.grade !== 'X') console.log(`  추천 방법: ${best.name} → 예상 이익 ${won(best.profit)}`);
    if (result.verification) console.log(`  교차검증: ${result.verification.ok ? '✅ 일치' : `❗ 불일치 ${result.verification.mismatches}건`}`);
    if (result.analysis.questions.length) console.log(`  ❓ ${result.analysis.questions.join(' / ')}`);
  }
}

function main() {
  const [cmd, ...args] = process.argv.slice(2);
  const criteria = config('criteria.json');
  const flag = (k) => {
    const i = args.indexOf(k);
    return i >= 0 ? args[i + 1] : null;
  };

  switch (cmd) {
    case 'web': {
      require('./server').start({ port: Number(flag('--port') || 4747), lan: args.includes('--lan'), open: !args.includes('--no-open') });
      break;
    }
    case 'demo': {
      const dir = path.join(PATHS.workspace, 'demo');
      fs.rmSync(dir, { recursive: true, force: true });
      fs.mkdirSync(dir, { recursive: true });
      store.loadSamples(dir);
      const cases = store.evaluateAll(dir, criteria);
      print(cases);
      const r = writeReport(cases, criteria, dir, { title: '샘플 체험 (가상 물건)', slug: 'demo' });
      console.log(`\n✅ 데모 리포트: ${path.relative(PATHS.root, r.html)}  (브라우저로 열기)`);
      console.log(`   웹 화면으로 보려면: node auction/src/cli.js web → 홈에서 "샘플로 체험"`);
      break;
    }
    case 'collect': {
      process.argv = [process.argv[0], path.join(__dirname, 'collect.js'), ...args];
      require('./collect');
      break;
    }
    case 'evaluate': {
      const cases = store.evaluateAll(PATHS.cases, criteria);
      if (!cases.length) return console.log('평가할 케이스가 없습니다 (auction/workspace/cases/*.json)');
      const only = args.filter((a) => !a.startsWith('--')).map((a) => path.basename(a, '.json'));
      print(only.length ? cases.filter((c) => only.includes(c._id) || only.includes(c.caseNo)) : cases);
      break;
    }
    case 'report': {
      const cases = store.evaluateAll(PATHS.cases, criteria);
      if (!cases.length) return console.log('케이스가 없습니다.');
      const r = writeReport(cases, criteria, PATHS.reports, { title: flag('--title') || undefined });
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
      const id = store.idOf(no);
      if (store.get(id)) return console.log(`이미 있음: workspace/cases/${id}.json`);
      const t = readJson(path.join(PATHS.samples, 'sample-B.json'));
      for (const k of Object.keys(t)) if (!k.startsWith('_')) t[k] = Array.isArray(t[k]) ? [] : typeof t[k] === 'object' ? {} : null;
      delete t._sample;
      t.caseNo = no;
      store.save({ ...t, _id: id });
      console.log(`📝 auction/workspace/cases/${id}.json`);
      break;
    }
    case 'verify': {
      const c = store.get(args[0]);
      const check = path.join(PATHS.cases, `${args[0]}.check.json`);
      if (!c || !fs.existsSync(check)) return console.log(`필요: workspace/cases/${args[0]}.json 과 ${args[0]}.check.json`);
      const v = verify(c, readJson(check));
      console.log(v.ok ? `✅ ${v.total}개 항목 모두 일치` : `❗ ${v.total}개 중 ${v.mismatches}개 불일치`);
      for (const r of v.rows.filter((x) => !x.ok)) console.log(`  - ${r.field}: 1차 ${r.first} / 2차 ${r.second}`);
      store.evaluateAll(PATHS.cases, criteria);
      break;
    }
    case 'content': {
      const c = store.get(args[0]);
      if (!c || !c.result) return console.log('분석된 케이스 id 를 주세요 (evaluate 먼저)');
      const type = args[1] || 'blog';
      console.log(content.toText(type, content.build(c, type)));
      break;
    }
    case 'ics': {
      const out = path.join(PATHS.workspace, 'auction.ics');
      fs.writeFileSync(out, calendar.toIcs(store.list(), { onlyWatched: !args.includes('--all') }));
      console.log(`📅 ${path.relative(PATHS.root, out)} — 구글 캘린더 설정 → 가져오기`);
      break;
    }
    case 'stats': {
      const s = stats(store.list());
      console.log(`낙찰 기록 ${s.n}건 · ±5% ${s.within5} · ±10% ${s.within10} · 평균 오차 ${s.mae == null ? '-' : pct(s.mae)} · ${s.hint}`);
      break;
    }
    default:
      console.log(fs.readFileSync(__filename, 'utf8').split('\n').slice(1, 12).join('\n').replace(/^\/\/ ?/gm, ''));
  }
}

main();
