const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const store = require('../src/store');
const blog = require('../src/blogpost');
const cards = require('../src/cards');
const { config } = require('../src/lib/util');

function cases() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'blog-'));
  store.loadSamples(d);
  return store.evaluateAll(d, { ...config('criteria.json'), cashAvailable: 2e8, goal: '투자(단기매도)' });
}

test('블로그 초안: naver_draft 형식·제목 길이·키워드·면책·주소 동까지', () => {
  const c = cases().find((x) => x._id === 'sample-B');
  const imgs = cards.cardsFor(c).map((k, i) => ({ name: k.name, path: `drafts/auction/x/${i}.png`, caption: k.caption }));
  const d = blog.build(c, imgs);
  assert.ok(d.title.length >= 20 && d.title.length <= 40, d.title);
  for (const k of ['title', 'mainKeyword', 'tags', 'blocks']) assert.ok(d[k]);
  assert.ok(d.blocks.every((b) => ['text', 'image', 'subtitle', 'quote', 'divider'].includes(b.type)));
  const all = JSON.stringify(d);
  assert.doesNotMatch(all, /\d+층|\d+호/); // 층·호 없음
  assert.match(all, /투자 권유나 법률 자문이 아니/);
  const st = blog.stats(d);
  assert.strictEqual(st.images, 5);
  assert.ok(st.keywordCount >= 3);
  assert.ok(st.quotes >= 2 && st.quotes <= 4);
  assert.ok(d.tags.length >= 5 && d.tags.length <= 10);
});

test('제외 물건 글: 입찰가 카드·활용법 없이 피해야 하는 이유', () => {
  const c = cases().find((x) => x._id === 'sample-X');
  const names = cards.cardsFor(c).map((k) => k.name);
  assert.ok(!names.includes('bid') && !names.includes('strategy'));
  const d = blog.build(c, []);
  assert.match(d.title, /피해야/);
  assert.ok(!d.blocks.some((b) => b.type === 'subtitle' && /입찰가는/.test(b.text)));
});

test('네이버 프로필: 허용된 이름만', () => {
  const { execFileSync } = require('child_process');
  const run = (arg) => execFileSync(process.execPath, ['-e', "console.log(require('path').basename(require('./scripts/lib/common').PROFILE_DIR))", '--', arg], { cwd: path.join(__dirname, '..', '..') }).toString().trim();
  assert.strictEqual(run('--profile=naver-profile-auction'), 'naver-profile-auction');
  assert.strictEqual(run('--profile=../etc'), 'naver-profile');
});

test('오늘의 물건: 조건 맞는 1건, 이미 쓴 물건·현금 초과·입찰 임박은 제외, 없으면 패스', () => {
  const { pick } = require('../src/daily');
  const all = cases().map((c) => ({ ...c, _sample: false }));
  const crit = { ...config('criteria.json'), cashAvailable: 2e8, daily: { grades: ['A', 'B'], maxCashNeeded: 2e8, minDaysBeforeSale: 7 } };
  const r = pick(all, crit, { blogged: [] });
  assert.strictEqual(r.chosen.caseNo, '2099타경10001'); // A 등급 우선
  const r2 = pick(all, crit, { blogged: ['2099타경10001'] });
  assert.strictEqual(r2.chosen.caseNo, '2099타경10002');
  const r3 = pick(all, { ...crit, daily: { ...crit.daily, maxCashNeeded: 5e7 } }, { blogged: [] });
  assert.strictEqual(r3.chosen, null);
  assert.ok(r3.skipped['필요 현금 초과'] >= 1);
  const r4 = pick(all, { ...crit, daily: { ...crit.daily, minDaysBeforeSale: 30 } }, { blogged: [] });
  assert.strictEqual(r4.chosen, null); // 샘플 입찰일은 9·16일 뒤
});

test('시리즈 글: 회차·현금 단락·시리즈 태그', () => {
  const c = cases().find((x) => x._id === 'sample-A');
  const d = blog.build(c, [], { series: '1억으로 경매', episode: 3 });
  const all = JSON.stringify(d);
  assert.match(all, /'1억으로 경매' 시리즈 3번째/);
  assert.ok(d.blocks.some((b) => b.type === 'subtitle' && /으로 가능할까/.test(b.text)));
  assert.strictEqual(d.tags[0], '1억으로경매');
});
