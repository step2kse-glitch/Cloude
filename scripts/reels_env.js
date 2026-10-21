// /reels 가 스토리보드를 짜기 전에 보는 환경 정보 (읽기 전용): 나레이션 준비 여부 · 배경음악 목록 · 폰트
// 사용법: node scripts/reels_env.js
const fs = require('fs');
const path = require('path');
const V = require('./lib/reels_voice');
const S = require('./lib/reels_style');
const R = require('./lib/reels');

const v = V.publicConfig();
console.log(`나레이션: ${v.ready ? `사용 가능 (${v.provider === 'mock' ? '테스트 음성' : `Fish Audio · 목소리 ${v.voiceId} · ${v.model}`})` : '설정 없음 → narration 쓰지 말 것'}`);

const bgmDir = path.join(R.ROOT, 'input', 'bgm');
const songs = fs.existsSync(bgmDir) ? fs.readdirSync(bgmDir).filter((n) => R.mediaKind(n) === 'audio') : [];
console.log(`배경음악 ${songs.length}곡${songs.length ? ':' : ' (없음 → bgm: null)'}`);
for (const n of songs) {
  let dur = '';
  try {
    dur = ` ${R.probe(path.join(bgmDir, n)).duration.toFixed(0)}초`;
  } catch {
    // 읽기 실패한 파일은 길이 생략
  }
  console.log(`- input/bgm/${n}${dur}`);
}

const f = S.fontStatus(R.ROOT);
console.log(`폰트: ${f.pretendard ? 'Pretendard' : '시스템 고딕'} / ${f.gowun ? '고운바탕' : '시스템 명조'}${f.user.length ? ` / 사용자 폰트 ${f.user.join(', ')}` : ''}`);
