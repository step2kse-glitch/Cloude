// 인스타그램 캐러셀 게시: output/<id>/NN.jpg + carousel/episodes/<id>.caption.txt
//
// 사용법:
//   node scripts/publish-instagram.mjs gal-01          # 미리보기만 (게시하지 않음)
//   node scripts/publish-instagram.mjs gal-01 --yes    # 실제 게시
//   node scripts/publish-instagram.mjs --check         # 토큰과 계정 확인
//   node scripts/publish-instagram.mjs --refresh       # 토큰 기한 연장 (60일)
//
// 필요한 것:
//   - 환경 변수 IG_ACCESS_TOKEN (Instagram 로그인 API, instagram_business_content_publish 권한)
//   - 네트워크 허용: graph.instagram.com
//   - 카드 JPG가 GitHub에 push 되어 있을 것 (인스타 서버가 공개 주소에서 이미지를 가져감)
import { readFile, readdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const API = 'https://graph.instagram.com/v23.0';
const RAW = process.env.IG_IMAGE_BASE ??
  'https://raw.githubusercontent.com/step2kse-glitch/Cloude/claude/gifted-turing-oumkwx';
const MAX_ITEMS = 10; // 인스타그램 API 캐러셀 최대 장수

const token = process.env.IG_ACCESS_TOKEN;
if (!token) {
  console.error('IG_ACCESS_TOKEN 환경 변수가 없습니다.');
  process.exit(1);
}

// Node fetch는 프록시 설정을 따르지 않아서 curl로 호출한다.
function call(method, url, params = {}) {
  const args = ['-sS', ...(method === 'GET' ? ['--get'] : ['-X', 'POST']), url];
  for (const [k, v] of Object.entries({ ...params, access_token: token })) {
    args.push('--data-urlencode', `${k}=${v}`);
  }
  const out = JSON.parse(execFileSync('curl', args, { encoding: 'utf8' }));
  if (out.error) throw new Error(`${out.error.message} (code ${out.error.code})`);
  return out;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitReady(id) {
  for (let i = 0; i < 30; i++) {
    const { status_code } = call('GET', `${API}/${id}`, { fields: 'status_code' });
    if (status_code === 'FINISHED') return;
    if (status_code === 'ERROR' || status_code === 'EXPIRED') throw new Error(`컨테이너 ${id}: ${status_code}`);
    await sleep(3000);
  }
  throw new Error(`컨테이너 ${id}: 시간 초과`);
}

const arg = process.argv[2];

if (arg === '--check') {
  console.log(call('GET', `${API}/me`, { fields: 'user_id,username,account_type' }));
  process.exit(0);
}

if (arg === '--refresh') {
  const out = call('GET', 'https://graph.instagram.com/refresh_access_token', { grant_type: 'ig_refresh_token' });
  console.log(`새 토큰 발급됨 (만료까지 ${Math.round(out.expires_in / 86400)}일). 환경 변수 IG_ACCESS_TOKEN을 새 값으로 바꿔 주세요:`);
  console.log(out.access_token);
  process.exit(0);
}

if (!arg) {
  console.error('사용법: node scripts/publish-instagram.mjs <episode-id> [--yes]');
  process.exit(1);
}

const id = arg;
const publish = process.argv.includes('--yes');
const files = (await readdir(path.join(root, 'output', id))).filter((f) => /^\d+\.jpg$/.test(f)).sort();
const caption = (await readFile(path.join(root, `carousel/episodes/${id}.caption.txt`), 'utf8')).trim();
const urls = files.map((f) => `${RAW}/output/${id}/${f}`);

console.log(`[${id}] 카드 ${files.length}장, 캡션 ${caption.length}자`);
urls.forEach((u) => console.log('  ', u));

if (files.length < 2) throw new Error('캐러셀은 2장 이상이어야 합니다.');
if (files.length > MAX_ITEMS) {
  throw new Error(`인스타그램 API 캐러셀은 최대 ${MAX_ITEMS}장입니다. 지금 ${files.length}장이라 줄여야 합니다.`);
}
if (caption.length > 2200) throw new Error('캡션은 2,200자 이하여야 합니다.');

if (!publish) {
  console.log('\n미리보기만 했습니다. 실제로 올리려면 --yes 를 붙이세요.');
  process.exit(0);
}

const children = [];
for (const image_url of urls) {
  const { id: child } = call('POST', `${API}/me/media`, { image_url, is_carousel_item: 'true' });
  children.push(child);
  console.log('  ✓ 이미지 등록', child);
}
for (const c of children) await waitReady(c);

const { id: container } = call('POST', `${API}/me/media`, {
  media_type: 'CAROUSEL',
  children: children.join(','),
  caption,
});
await waitReady(container);

const { id: mediaId } = call('POST', `${API}/me/media_publish`, { creation_id: container });
const { permalink } = call('GET', `${API}/${mediaId}`, { fields: 'permalink' });
console.log(`\n게시 완료: ${permalink}`);
