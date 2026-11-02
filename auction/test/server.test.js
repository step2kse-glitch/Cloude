const test = require('node:test');
const assert = require('node:assert');
const http = require('http');

// 서버 API 스모크: 실제 workspace 를 건드리지 않도록 상태 조회만
test('웹 서버: 화면·상태 API 응답', async () => {
  const { start } = require('../src/server');
  const server = start({ port: 0, open: false });
  await new Promise((r) => server.once('listening', r));
  const { port } = server.address();
  const get = (p) => new Promise((res, rej) => http.get(`http://127.0.0.1:${port}${p}`, (r) => {
    let d = '';
    r.on('data', (x) => (d += x));
    r.on('end', () => res({ status: r.statusCode, body: d }));
  }).on('error', rej));
  const home = await get('/');
  assert.strictEqual(home.status, 200);
  assert.match(home.body, /내 경매 비서/);
  const st = JSON.parse((await get('/api/state')).body);
  assert.ok(Array.isArray(st.cases) && st.criteria);
  assert.strictEqual((await get('/../package.json')).status !== 200, true);
  server.close();
});
