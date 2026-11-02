const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const store = require('../src/store');
const { stats } = require('../src/outcomes');
const calendar = require('../src/calendar');
const { verify } = require('../src/verify');
const content = require('../src/content');
const { config } = require('../src/lib/util');

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'auc-'));
const criteria = { ...config('criteria.json'), cashAvailable: 2e8, goal: '투자(단기매도)' };
function loaded() {
  const d = tmp();
  store.loadSamples(d);
  return { d, cases: store.evaluateAll(d, criteria) };
}

test('샘플 불러오기: 입찰일이 오늘 기준으로 옮겨짐', () => {
  const { cases } = loaded();
  const a = cases.find((c) => c._id === 'sample-A');
  const days = Math.round((new Date(a.saleDate) - new Date(new Date().toISOString().slice(0, 10))) / 864e5);
  assert.strictEqual(days, 9);
});

test('태그: 위험 물건엔 위험 태그, 빈 물건엔 임차인없음 안 붙음', () => {
  const { d, cases } = loaded();
  assert.ok(cases.find((c) => c._id === 'sample-X').result.tags.some((t) => t.text === '선순위가처분' && t.level === 'bad'));
  store.save({ caseNo: '빈물건', registry: [], tenants: [] }, d);
  const empty = store.evaluateAll(d, criteria).find((c) => c.caseNo === '빈물건');
  assert.ok(!empty.result.tags.some((t) => t.text === '임차인없음'));
  assert.strictEqual(empty.result.grade, '보류');
});

test('낙찰가율: 사례가 있으면 예상 낙찰가·가능성 계산, 없으면 안내', () => {
  const { cases } = loaded();
  const a = cases.find((c) => c._id === 'sample-A').result.competition;
  assert.strictEqual(a.status, 'ok');
  assert.ok(['높음', '보통', '낮음'].includes(a.chance));
  assert.ok(a.avgRatio > 0.6 && a.avgRatio < 0.9);
  const x = cases.find((c) => c._id === 'past-3').result.competition;
  assert.strictEqual(x.status, 'none');
});

test('적중률: 낙찰 기록만 집계, 구간 비율이 단조 증가', () => {
  const { cases } = loaded();
  const s = stats(cases);
  assert.strictEqual(s.n, 3);
  assert.ok(s.within5 <= s.within10 && s.within10 <= s.within15 && s.within15 <= s.within20);
  assert.ok(s.mae >= 0);
});

test('캘린더: 관심물건만 ics, 낙찰 시 잔금 일정', () => {
  const { cases } = loaded();
  const ics = calendar.toIcs(cases);
  assert.match(ics, /SUMMARY:입찰 2099타경10001/);
  assert.doesNotMatch(ics, /2099타경10003/); // 관심 아님
  const won = { ...cases.find((c) => c._id === 'sample-A'), outcome: { result: '낙찰', won: true } };
  assert.ok(calendar.eventsFor(won).some((e) => e.kind === '잔금'));
});

test('교차검증: 금액·날짜 차이를 잡아냄', () => {
  const { cases } = loaded();
  const a = cases.find((c) => c._id === 'sample-B');
  const same = verify(a, JSON.parse(JSON.stringify(a)));
  assert.strictEqual(same.ok, true);
  const b = JSON.parse(JSON.stringify(a));
  b.minPrice = 1960000000; // 0 하나 더
  b.tenants[0].moveIn = '2021-09-01';
  const diff = verify(a, b);
  assert.strictEqual(diff.mismatches, 2);
});

test('콘텐츠: 주소는 동까지만, 면책 문구 포함', () => {
  assert.strictEqual(content.publicAddress('서울특별시 강동구 상일동 514 고덕롯데캐슬 719동 3층304호'), '서울특별시 강동구 상일동');
  const { cases } = loaded();
  const c = cases.find((x) => x._id === 'sample-B');
  for (const type of ['blog', 'shorts', 'longform']) {
    const text = content.toText(type, content.build(c, type));
    assert.match(text, /투자 권유|자문/);
  }
});
