// 인스타그램 릴스 게시: 공개 MP4 주소 + carousel/episodes/<id>.caption.txt
//
// 사용법:
//   node scripts/publish-reel.mjs reel-ink-01 --video-url <MP4 주소>          # 미리보기만
//   node scripts/publish-reel.mjs reel-ink-01 --video-url <MP4 주소> --yes    # 실제 게시
//
// MP4 주소는 인스타 서버가 직접 가져갈 수 있는 공개 주소여야 한다 (캔바 내보내기 주소 등).
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const API = 'https://graph.instagram.com/v23.0';

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

// 영상은 인스타 서버에서 처리하는 데 이미지보다 오래 걸린다.
async function waitReady(id) {
  for (let i = 0; i < 60; i++) {
    const { status_code } = call('GET', `${API}/${id}`, { fields: 'status_code' });
    if (status_code === 'FINISHED') return;
    if (status_code === 'ERROR' || status_code === 'EXPIRED') throw new Error(`컨테이너 ${id}: ${status_code}`);
    await sleep(5000);
  }
  throw new Error(`컨테이너 ${id}: 시간 초과`);
}

const id = process.argv[2];
const i = process.argv.indexOf('--video-url');
const video_url = i > 0 ? process.argv[i + 1] : undefined;
if (!id || !video_url) {
  console.error('사용법: node scripts/publish-reel.mjs <id> --video-url <MP4 주소> [--yes]');
  process.exit(1);
}

const caption = (await readFile(path.join(root, `carousel/episodes/${id}.caption.txt`), 'utf8')).trim();
console.log(`[${id}] 캡션 ${caption.length}자`);
if (caption.length > 2200) throw new Error('캡션은 2,200자 이하여야 합니다.');

if (!process.argv.includes('--yes')) {
  console.log('\n미리보기만 했습니다. 실제로 올리려면 --yes 를 붙이세요.');
  process.exit(0);
}

const { id: container } = call('POST', `${API}/me/media`, {
  media_type: 'REELS',
  video_url,
  caption,
  share_to_feed: 'true',
});
console.log('  ✓ 영상 등록', container);
await waitReady(container);

// 컨테이너가 FINISHED여도 곧바로 게시하면 9007(Media ID is not available)이 날 때가 있어 잠시 뒤 다시 시도한다.
let mediaId;
for (let n = 0; ; n++) {
  try {
    ({ id: mediaId } = call('POST', `${API}/me/media_publish`, { creation_id: container }));
    break;
  } catch (e) {
    if (!/code 9007/.test(e.message) || n >= 5) throw e;
    console.log(`  … 게시 대기 (${n + 1}/5)`);
    await sleep(10000);
  }
}
const { permalink } = call('GET', `${API}/${mediaId}`, { fields: 'permalink' });
console.log(`\n게시 완료: ${permalink}`);
