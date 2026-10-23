// AI 오피스: 직원(역할) 상태 · 업무 지시 · 보고함 · 결재함 · 비서 브리핑
// 직원은 이 폴더의 실제 도구다. 블로그 작가=/write, 릴스 PD=/reels, 영상 편집자=렌더러, 사실 검수관=fact_check, 비서=읽기 전용 Claude.
// 모든 AI 작업은 Claude 구독(claude -p)으로만. 네이버 임시저장·영상 렌더는 사장님(사용자)의 결재 클릭이 있어야 실행된다.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');
const R = require('./reels');
const FC = require('../fact_check');

const OFFICE_DIR = path.join(R.ROOT, 'drafts', 'office');
const TASK_DIR = path.join(OFFICE_DIR, 'tasks');
const IS_WIN = process.platform === 'win32';
const running = new Map(); // taskId → proc

const EMPLOYEES = [
  { id: 'writer', name: '블로그 작가', team: 'content', desk: [3, 3], avatar: '✍️', role: '사진·메모로 네이버 블로그 초안을 써요 (/write)' },
  { id: 'reels', name: '릴스 PD', team: 'content', desk: [5, 3], avatar: '🎬', role: '사진·영상으로 릴스 스토리보드를 짜요 (/reels)' },
  { id: 'editor', name: '영상 편집자', team: 'edit', desk: [9, 3], avatar: '🎞️', role: '스토리보드를 자막·음악 넣은 영상으로 만들어요' },
  { id: 'checker', name: '사실 검수관', team: 'review', desk: [3, 8], avatar: '🔎', role: '글·영상의 숫자가 자료에 있는지 대조해요' },
  { id: 'privacy', name: '개인정보 지킴이', team: 'review', desk: [5, 8], avatar: '🛡️', role: '아이 얼굴·송장·동호수 모자이크를 챙겨요' },
  { id: 'secretary', name: '비서', team: 'ops', desk: [9, 8], avatar: '🗂️', role: '현황을 정리하고 질문에 답해요 (파일 수정 안 함)' },
];
const TEAMS = {
  content: { name: '기획·콘텐츠팀', color: '#F97316' },
  edit: { name: '편집팀', color: '#3B82F6' },
  review: { name: '검수팀', color: '#8B5CF6' },
  ops: { name: '운영팀', color: '#22C55E' },
};

const now = () => new Date().toISOString();
const ensure = () => fs.mkdirSync(TASK_DIR, { recursive: true });
const taskPath = (id) => {
  if (!/^[\w-]+$/.test(id)) throw new Error('잘못된 업무 ID');
  return path.join(TASK_DIR, `${id}.json`);
};

function readTask(id) {
  return R.readJson(taskPath(id));
}
function saveTask(t) {
  ensure();
  t.updatedAt = now();
  R.writeJson(taskPath(t.id), t);
  return t;
}
function listTasks() {
  ensure();
  return fs
    .readdirSync(TASK_DIR)
    .filter((n) => n.endsWith('.json'))
    .map((n) => R.readJson(path.join(TASK_DIR, n)))
    .filter(Boolean)
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

// 스튜디오가 꺼지면서 끊긴 업무 표시
function recoverInterrupted() {
  for (const t of listTasks()) {
    if (t.status === 'working' || t.status === 'saving') {
      saveTask({ ...t, status: 'error', output: `${t.output || ''}\n(작업 중에 스튜디오가 꺼졌어요. 다시 지시해 주세요.)`.trim() });
    }
  }
}

function tailFile(file, n = 60) {
  try {
    return fs.readFileSync(file, 'utf8').split('\n').slice(-n).join('\n').trim();
  } catch {
    return '';
  }
}

function run(task, cmd, args, onDone) {
  const log = path.join(TASK_DIR, `${task.id}.log`);
  const out = fs.createWriteStream(log, { flags: 'a' });
  const isClaude = cmd === 'claude';
  const proc = spawn(cmd, args, { cwd: R.ROOT, shell: IS_WIN && isClaude, env: process.env, stdio: ['ignore', 'pipe', 'pipe'] });
  running.set(task.id, proc);
  let stdout = '';
  proc.stdout.on('data', (d) => {
    stdout += d;
    out.write(d);
  });
  proc.stderr.on('data', (d) => out.write(d));
  proc.on('error', (e) => out.write(`\n실행 실패: ${e.message}\n`));
  proc.on('close', (code) => {
    out.end();
    running.delete(task.id);
    onDone(code, stdout.trim(), tailFile(log));
  });
}

const q = (s) => (IS_WIN ? `"${String(s).replace(/"/g, "'")}"` : s);

// ---------- 업무 지시 ----------
function assign(employee, instruction) {
  const text = String(instruction || '').trim().slice(0, 1500);
  if (!text) throw new Error('지시 내용을 적어 주세요.');
  const id = `${Date.now().toString(36)}-${crypto.randomBytes(2).toString('hex')}`;
  const task = saveTask({ id, employee, instruction: text, status: 'working', createdAt: now(), read: false });

  if (employee === 'secretary') {
    const prompt =
      `너는 이 폴더(네이버 블로그·릴스 작업실)의 비서다. 사장님 지시: "${text}"\n` +
      '규칙: 파일을 절대 수정하지 않는다. drafts/reels/*/job.json, drafts/reels/*/review.md, drafts/*.json, data/trends.md, data/profile.md 등 ' +
      '파일에서 확인한 내용만 근거로 한국어로 짧게(12줄 이내) 답한다. 모르는 건 모른다고 말하고, 필요하면 어느 직원에게 맡기면 되는지 한 줄 제안한다.';
    run(task, 'claude', ['-p', q(prompt), '--allowedTools', q('Read,Glob,Grep')], (code, stdout, log) => {
      saveTask({ ...readTask(id), status: code === 0 ? 'report' : 'error', output: code === 0 ? stdout : log });
    });
  } else if (employee === 'writer') {
    const started = Date.now();
    const prompt = `/write --office ${text}`;
    const tools = 'Read,Write,Edit,Glob,Grep,Bash(node scripts/fact_check.js *),Bash(node scripts/mosaic.js *)';
    run(task, 'claude', ['-p', q(prompt), '--allowedTools', q(tools)], (code, stdout, log) => {
      const draft = newestDraftSince(started);
      const t = readTask(id);
      if (code !== 0) return saveTask({ ...t, status: 'error', output: log });
      if (!draft) return saveTask({ ...t, status: 'report', output: stdout || '초안 없이 끝났어요 (질문이 있을 수 있어요).' });
      const fc = FC.report(FC.factCheck(R.readJson(path.join(R.ROOT, draft)) || {}, FC.sourcesFor(draft, [], text)));
      saveTask({ ...t, status: 'approval', output: stdout, draft, factCheck: fc });
    });
  } else {
    throw new Error('지금은 비서와 블로그 작가에게만 글로 지시할 수 있어요. 릴스는 만들기 탭을 써 주세요.');
  }
  return task;
}

// /write 가 새로 만든 초안 JSON (예시·모자이크 spec 제외)
function newestDraftSince(ms) {
  const dir = path.join(R.ROOT, 'drafts');
  const files = fs
    .readdirSync(dir)
    .filter((n) => n.endsWith('.json') && n !== 'example.json' && !n.startsWith('mosaic-'))
    .map((n) => ({ n, t: fs.statSync(path.join(dir, n)).mtimeMs }))
    .filter((f) => f.t >= ms - 1000)
    .sort((a, b) => b.t - a.t);
  return files.length ? `drafts/${files[0].n}` : null;
}

// 결재: 블로그 초안 → 네이버 임시저장 (발행은 여전히 사람이 네이버에서 직접)
function approve(id) {
  const t = readTask(id);
  if (!t || t.status !== 'approval' || !t.draft) throw new Error('결재할 초안이 없어요.');
  if (!fs.existsSync(path.join(R.ROOT, 'naver-profile'))) throw new Error('네이버 로그인이 아직 없어요. 먼저 setup(또는 /setup-login)으로 로그인해 주세요.');
  saveTask({ ...t, status: 'saving', approvedAt: now() });
  run(t, process.execPath, [path.join(R.ROOT, 'scripts', 'naver_draft.js'), t.draft], (code, stdout, log) => {
    saveTask({ ...readTask(id), status: code === 0 ? 'done' : 'error', saveLog: log, read: false });
  });
  return readTask(id);
}

function reject(id) {
  const t = readTask(id);
  if (!t) throw new Error('업무를 찾을 수 없어요.');
  return saveTask({ ...t, status: 'rejected', read: true });
}

function markRead(id) {
  const t = readTask(id);
  if (t) saveTask({ ...t, read: true });
}

function cancel(id) {
  const p = running.get(id);
  if (p) p.kill();
}

// ---------- 상태 모으기 ----------
function reelsJobs(listJobs) {
  return listJobs().map((j) => ({ ...j, sb: R.readJson(path.join(R.jobDir(j.id), 'storyboard.json')) }));
}

function state(listJobs) {
  const tasks = listTasks();
  const jobs = reelsJobs(listJobs);
  const st = Object.fromEntries(EMPLOYEES.map((e) => [e.id, { status: 'idle', note: '대기 중' }]));
  const set = (id, status, note, link) => (st[id] = { status, note, link });

  const busyTask = (emp) => tasks.find((t) => t.employee === emp && (t.status === 'working' || t.status === 'saving'));
  const w = busyTask('writer');
  if (w) set('writer', 'working', w.status === 'saving' ? '네이버에 임시저장 중' : `초안 쓰는 중: ${w.instruction.slice(0, 24)}`);
  else if (tasks.some((t) => t.employee === 'writer' && t.status === 'approval')) set('writer', 'waiting', '초안 결재 대기');
  const s = busyTask('secretary');
  if (s) set('secretary', 'working', `정리 중: ${s.instruction.slice(0, 24)}`);

  const sbing = jobs.find((j) => j.status === 'storyboarding');
  if (sbing) set('reels', 'working', `스토리보드 짜는 중: ${sbing.title}`, `#job/${sbing.id}`);
  else if (jobs.some((j) => j.status === 'storyboard')) set('reels', 'waiting', '스토리보드 결재 대기', '#home');
  const rend = jobs.find((j) => j.status === 'rendering');
  if (rend) set('editor', 'working', `${rend.progress || '영상 만드는 중'}: ${rend.title}`, `#job/${rend.id}`);
  else {
    const unposted = jobs.filter((j) => j.hasReel && !(j.posted && (j.posted.instagram || j.posted.youtube)));
    if (unposted.length) set('editor', 'waiting', `완성 영상 ${unposted.length}개 게시 대기`, '#post');
  }

  // 검수관·지킴이: 가장 최근 스토리보드 기준 (로컬 계산, 요금 없음)
  const latest = jobs.find((j) => j.sb && Array.isArray(j.sb.cuts));
  if (latest) {
    const r = FC.factCheck(latest.sb, FC.sourcesFor(path.join(R.jobDir(latest.id), 'storyboard.json')));
    set('checker', r.missing.length ? 'warn' : 'idle', r.missing.length ? `"${latest.title}" 자료에 없는 숫자 ${r.missing.length}개` : `"${latest.title}" 숫자 점검 통과`, `#job/${latest.id}`);
    const blurs = latest.sb.cuts.reduce((n, c) => n + (c.blur || []).length, 0);
    set('privacy', 'idle', blurs ? `"${latest.title}" 모자이크 ${blurs}곳` : `"${latest.title}" 가릴 것 없음`, `#job/${latest.id}`);
  }

  const approvals = [];
  for (const t of tasks.filter((x) => x.status === 'approval')) {
    approvals.push({ kind: 'blog', id: t.id, from: '블로그 작가', title: `블로그 초안: ${t.instruction.slice(0, 40)}`, detail: t.factCheck || '', draft: t.draft, action: '네이버 임시저장 승인' });
  }
  for (const j of jobs.filter((x) => x.status === 'storyboard')) {
    approvals.push({ kind: 'reels', id: j.id, from: '릴스 PD', title: `릴스 스토리보드: ${j.title}`, link: `#job/${j.id}`, action: '검토하고 영상 만들기' });
  }
  for (const j of jobs.filter((x) => x.hasReel && !(x.posted && (x.posted.instagram || x.posted.youtube)))) {
    approvals.push({ kind: 'post', id: j.id, from: '영상 편집자', title: `게시 대기: ${j.title}`, link: '#post', action: '확인하고 직접 게시' });
  }

  const reports = tasks
    .filter((t) => ['report', 'done', 'error', 'rejected'].includes(t.status))
    .slice(0, 30)
    .map((t) => ({
      id: t.id,
      from: (EMPLOYEES.find((e) => e.id === t.employee) || {}).name || t.employee,
      instruction: t.instruction,
      status: t.status,
      read: !!t.read,
      at: t.updatedAt,
      body: t.status === 'done' || (t.status === 'error' && t.saveLog) ? `[네이버 임시저장 결과]\n${t.saveLog}` : t.output || '',
    }));

  // 실시간: 최근 활동 (업무 + 릴스 작업)
  const live = [
    ...tasks.slice(0, 15).map((t) => ({ at: t.updatedAt, text: `${(EMPLOYEES.find((e) => e.id === t.employee) || {}).name}: ${statusWord(t.status)} — ${t.instruction.slice(0, 40)}` })),
    ...jobs.slice(0, 15).map((j) => ({ at: j.updatedAt || j.createdAt, text: `릴스 "${j.title}": ${({ storyboarding: 'AI 구성 중', storyboard: '결재 대기', rendering: '영상 만드는 중', rendered: '완성', error: '확인 필요', uploaded: '자료 올림' })[j.status] || j.status}` })),
  ]
    .sort((a, b) => String(b.at).localeCompare(String(a.at)))
    .slice(0, 20);

  const today = new Date().toISOString().slice(0, 10);
  return {
    employees: EMPLOYEES.map((e) => ({ ...e, teamName: TEAMS[e.team].name, teamColor: TEAMS[e.team].color, ...st[e.id] })),
    teams: TEAMS,
    approvals,
    reports,
    unread: reports.filter((r) => !r.read).length,
    live,
    todayTasks: tasks.filter((t) => String(t.createdAt).startsWith(today)).length + jobs.filter((j) => String(j.createdAt).startsWith(today)).length,
  };
}

function statusWord(s) {
  return { working: '작업 중', report: '보고 완료', approval: '결재 요청', saving: '임시저장 중', done: '임시저장 완료', error: '문제 발생', rejected: '반려' }[s] || s;
}

// 비서 브리핑: AI 없이 파일만 보고 바로 계산 (요금 없음)
function briefing(listJobs) {
  const s = state(listJobs);
  const jobs = reelsJobs(listJobs);
  const lines = [`📋 ${new Date().toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' })} 브리핑`];
  lines.push(`· 결재 대기 ${s.approvals.length}건${s.approvals.length ? ` — ${s.approvals.slice(0, 3).map((a) => a.title).join(' / ')}` : ''}`);
  lines.push(`· 안 읽은 보고 ${s.unread}건`);
  const working = s.employees.filter((e) => e.status === 'working');
  lines.push(`· 지금 일하는 직원: ${working.length ? working.map((e) => `${e.name}(${e.note})`).join(', ') : '없음'}`);
  const upcoming = jobs
    .filter((j) => j.schedule && j.schedule.at && !(j.posted && (j.posted.instagram || j.posted.youtube)))
    .sort((a, b) => a.schedule.at.localeCompare(b.schedule.at));
  lines.push(`· 게시 예정: ${upcoming.length ? upcoming.slice(0, 3).map((j) => `${j.schedule.at.replace('T', ' ')} ${j.title}`).join(' / ') : '잡힌 일정 없음'}`);
  const posted = jobs.filter((j) => j.posted && (j.posted.instagram || j.posted.youtube)).length;
  lines.push(`· 릴스: 전체 ${jobs.length}개 · 게시 완료 ${posted}개`);
  const checker = s.employees.find((e) => e.id === 'checker');
  if (checker && checker.status === 'warn') lines.push(`· ⚠️ 검수관: ${checker.note}`);
  lines.push('· 리마인드: 블로그는 주 2~3회, 하루 2건 이상 금지 · 업로드는 오전 9~11시 / 밤 9~11시');
  return lines.join('\n');
}

module.exports = { EMPLOYEES, TEAMS, assign, approve, reject, markRead, cancel, state, briefing, recoverInterrupted, readTask };
