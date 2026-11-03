// Claude Code 비대화형 실행 (구독 사용, API 키 없음) — 웹 서버의 AI 버튼과 매일 자동 실행이 함께 쓴다
const { spawn, spawnSync } = require('child_process');
const { PATHS } = require('./lib/util');

const ALLOWED = ['Read', 'Write', 'Edit', 'Glob', 'Grep', 'WebSearch', 'Bash(node auction/src/*)', 'Bash(npm install)', 'Bash(npx playwright install chromium)'];
const NONINTERACTIVE = '\n\n[비대화형 실행] 사용자에게 질문할 수 없다. auction/config/criteria.json 값으로 진행하고, 모르는 사실은 지어내지 말고 케이스 questions 에 기록한 뒤 끝에 무엇이 남았는지 요약하라.';

function claudeBin() {
  const r = spawnSync(process.platform === 'win32' ? 'where' : 'which', ['claude'], { encoding: 'utf8' });
  return r.status === 0 ? r.stdout.split(/\r?\n/)[0].trim() : null;
}

// prompt 실행 → Promise<종료코드>. onData 로 출력 전달
function runClaude(prompt, { onData = () => {} } = {}) {
  const bin = claudeBin();
  if (!bin) return Promise.resolve(null);
  return new Promise((resolve) => {
    const child = spawn(bin, ['-p', prompt + NONINTERACTIVE, '--permission-mode', 'acceptEdits', '--allowedTools', ...ALLOWED], { cwd: PATHS.root, shell: process.platform === 'win32', env: process.env });
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    child.on('error', (e) => {
      onData(Buffer.from(`\n실행 오류: ${e.message}`));
      resolve(1);
    });
    child.on('close', resolve);
  });
}

module.exports = { ALLOWED, NONINTERACTIVE, claudeBin, runClaude };
