// 초안 JSON → 네이버 블로그 임시저장. 발행은 절대 하지 않는다 (installPublishGuard).
// 사용법: node scripts/naver_draft.js drafts/20261009-xxx.json [--dry-run]
//   --dry-run : 저장 클릭만 생략 (셀렉터 디버깅 중 "저장 글"에 실패본이 쌓이지 않게)
const fs = require('fs');
const path = require('path');
const {
  ROOT,
  WRITE_URL,
  sleep,
  launch,
  getEditorFrame,
  installPublishGuard,
  assertGuard,
  insertTextSafe,
  firstVisible,
  removeDim,
  norm,
  draftBaseName,
  ensureDir,
} = require('./lib/common');

const args = process.argv.slice(2);
const draftPath = args.find((a) => !a.startsWith('--'));
const DRY_RUN = args.includes('--dry-run');
if (!draftPath) {
  console.error('사용법: node scripts/naver_draft.js <draft.json> [--dry-run]');
  process.exit(1);
}

const draft = JSON.parse(fs.readFileSync(path.resolve(ROOT, draftPath), 'utf8'));
const NAME = draftBaseName(draftPath);
const OUT_DIR = path.join(ROOT, 'drafts');
ensureDir(OUT_DIR);

const BODY_P = '.se-component.se-text .se-section-text p.se-text-paragraph';
const TITLE = '.se-title-text';

const result = {
  본문: '대기',
  사진: '대기',
  소제목: '대기',
  동영상: draft.video ? '대기' : '해당 없음',
  지도: draft.place ? '대기' : '해당 없음',
  제목: '대기',
  태그: draft.tags && draft.tags.length ? '대기' : '해당 없음',
  임시저장: DRY_RUN ? '생략(--dry-run)' : '대기',
  텍스트대조: '대기',
};
const manual = [];

let page;
let frame;

// ---------- 기본 동작 ----------

async function closeStartupPopups() {
  const cancel = await firstVisible(frame, ['.se-popup-button-cancel'], 4000);
  if (cancel) {
    await cancel.click(); // "작성 중인 글" → 새로 쓰기
    await sleep(800);
  }
  const help = await firstVisible(frame, ['.se-help-panel-close-button'], 2000);
  if (help) await help.click();
}

// 캐럿을 본문 마지막 텍스트 문단 끝으로
async function focusEnd() {
  await removeDim(frame);
  const last = frame.locator(BODY_P).last();
  await last.click();
  await page.keyboard.press('End');
  await sleep(150);
}

async function lastComponentIsText() {
  return frame.evaluate(() => {
    const comps = document.querySelectorAll('.se-components-wrap .se-component, .se-component');
    const last = comps[comps.length - 1];
    return !!(last && last.classList.contains('se-text'));
  });
}

// 인용구·구분선·사진·지도·영상 뒤 캐럿 복귀. 마지막 컴포넌트가 텍스트가 아니면 아래로 이동해 새 문단을 만든다.
async function exitToNewParagraph() {
  await removeDim(frame);
  if (!(await lastComponentIsText())) {
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    await sleep(200);
  }
  if (await lastComponentIsText()) await focusEnd();
  else throw new Error('컴포넌트 뒤 텍스트 문단 복귀 실패 (probe로 실측 필요)');
}

async function typeLines(text) {
  const lines = String(text).split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (lines[i]) await insertTextSafe(page, lines[i]);
    if (i < lines.length - 1) await page.keyboard.press('Enter');
  }
}

// ---------- 문단 서식 (소제목/본문) ----------

async function openFormatDropdown() {
  const btn = await firstVisible(frame, ['button.se-text-format-toolbar-button'], 3000);
  if (!btn) throw new Error('문단 서식 버튼 없음');
  await btn.click();
  await sleep(300);
}

async function clickOption(label) {
  const opt = frame
    .locator('[class*="text-format"] button, [class*="text-format"] li, .se-toolbar-option-text-format button')
    .filter({ hasText: label })
    .first();
  await opt.click({ timeout: 3000 });
  await sleep(300);
}

async function readFormatLabel() {
  const btn = frame.locator('button.se-text-format-toolbar-button').first();
  return ((await btn.innerText().catch(() => '')) || '').trim();
}

async function setFontSize19() {
  const btn = await firstVisible(frame, ['button.se-font-size-code-toolbar-button'], 3000);
  if (!btn) throw new Error('글자 크기 버튼 없음');
  await btn.click();
  await sleep(300);
  await frame.locator('[class*="fs19"]').first().click({ timeout: 3000 });
  await sleep(200);
}

let subtitleFails = 0;
async function insertSubtitle(text) {
  try {
    // 순서 핵심: 서식 → 크기 → 텍스트
    await openFormatDropdown();
    await clickOption('소제목');
    try {
      await setFontSize19();
    } catch (e) {
      console.warn('  ⚠ 소제목 크기 19 적용 실패:', e.message);
    }
    await insertTextSafe(page, text);
    const label = await readFormatLabel();
    if (!label.includes('소제목')) throw new Error(`서식 라벨 확인 실패: "${label}"`);
    await page.keyboard.press('Enter');
    await openFormatDropdown();
    await clickOption('본문');
    const back = await readFormatLabel();
    if (!back.includes('본문')) console.warn(`  ⚠ 본문 복귀 라벨 확인 실패: "${back}"`);
  } catch (e) {
    subtitleFails++;
    console.warn('  ⚠ 소제목 서식 실패 → 일반 텍스트로 입력:', e.message);
    await page.keyboard.press('Escape').catch(() => {});
    await focusEnd();
    await insertTextSafe(page, text);
    await page.keyboard.press('Enter');
  }
}

// ---------- 사진 ----------

async function insertImage(block) {
  const file = path.resolve(ROOT, block.path);
  if (!fs.existsSync(file)) throw new Error(`사진 파일 없음: ${block.path}`);
  const before = await frame.locator('.se-component.se-image').count();
  const btn = await firstVisible(frame, ['button.se-image-toolbar-button'], 5000);
  if (!btn) throw new Error('사진 버튼 없음');
  const [chooser] = await Promise.all([page.waitForEvent('filechooser', { timeout: 15000 }), btn.click()]);
  await chooser.setFiles(file);

  const deadline = Date.now() + 60000;
  while ((await frame.locator('.se-component.se-image').count()) <= before) {
    if (Date.now() > deadline) throw new Error(`사진 업로드 시간 초과: ${block.path}`);
    await sleep(500);
  }
  await sleep(1200);

  if (block.caption) {
    try {
      const cap = frame.locator('.se-component.se-image').last().locator('.se-caption p, .se-caption').first();
      await cap.click({ timeout: 3000 });
      await insertTextSafe(page, block.caption);
    } catch (e) {
      manual.push(`사진 캡션 수동 입력: ${path.basename(block.path)} → "${block.caption}"`);
    }
  }
  await exitToNewParagraph();
}

// ---------- 인용구 / 구분선 ----------

async function insertQuote(text) {
  const btn = await firstVisible(frame, ['button.se-insert-quotation-default-toolbar-button'], 4000);
  if (!btn) throw new Error('인용구 버튼 없음');
  await btn.click();
  await sleep(600);
  await typeLines(text);
  await exitToNewParagraph();
}

async function insertDivider() {
  const btn = await firstVisible(frame, ['button.se-insert-horizontal-line-default-toolbar-button'], 4000);
  if (!btn) throw new Error('구분선 버튼 없음');
  await btn.click();
  await sleep(600);
  await exitToNewParagraph();
}

// ---------- 동영상 ----------

async function insertVideo(video) {
  const file = path.resolve(ROOT, video.path);
  if (!fs.existsSync(file)) throw new Error(`동영상 파일 없음: ${video.path}`);
  const title = String(video.title || draft.title || '살림 꿀템 사용 영상').slice(0, 40);

  const btn = await firstVisible(frame, ['button.se-video-toolbar-button', 'button[class*="video-toolbar-button"]'], 5000);
  if (!btn) throw new Error('동영상 툴바 버튼 없음 (추정 셀렉터 — probe 필요)');
  await btn.click();
  const popup = frame.locator('.se-popup-video-upload').first();
  await popup.waitFor({ state: 'visible', timeout: 10000 });

  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser', { timeout: 15000 }),
    popup.locator('button.nvu_btn_append.nvu_local').first().click(),
  ]);
  await chooser.setFiles(file);

  const titleInput = popup.locator('input[placeholder*="제목"]').first();
  await titleInput.waitFor({ state: 'visible', timeout: 60000 });
  await titleInput.click();
  await insertTextSafe(page, title);

  // 업로드 완료까지 최대 10분: 완료/확인 버튼이 활성화되면 클릭
  console.log('  동영상 업로드 중... (수 분 걸릴 수 있음)');
  const done = popup.locator('button').filter({ hasText: /^(완료|확인|첨부)$/ }).last();
  const deadline = Date.now() + 10 * 60 * 1000;
  while (Date.now() < deadline) {
    if ((await done.count()) && (await done.isEnabled().catch(() => false))) break;
    await sleep(3000);
  }
  await done.click({ timeout: 5000 });

  try {
    await popup.waitFor({ state: 'hidden', timeout: 15000 });
  } catch {
    await frame.locator('button.nvu_btn_close').first().click({ timeout: 3000 }).catch(() => {});
    await frame.evaluate(() => document.querySelectorAll('.se-popup-video-upload').forEach((el) => el.remove()));
  }
  await removeDim(frame);
  await exitToNewParagraph();
}

// ---------- 지도 ----------

async function insertPlace(place) {
  const btn = await firstVisible(frame, ['button.se-map-toolbar-button', 'button[class*="map-toolbar-button"]', 'button[class*="place-toolbar-button"]'], 5000);
  if (!btn) throw new Error('지도 툴바 버튼 없음 (추정 셀렉터 — probe 필요)');
  await btn.click();
  await sleep(1000);
  const popup = frame.locator('.se-popup').filter({ has: frame.locator('input') }).last();
  const input = popup.locator('input[type="text"], input[type="search"], input:not([type])').first();
  await input.click();
  await insertTextSafe(page, place.query || place.name);
  await page.keyboard.press('Enter');
  await sleep(2500);

  const items = popup.locator('li');
  const n = await items.count();
  if (!n) {
    await closePlacePopup(popup);
    return '❗수동 필요 (검색 0건)';
  }
  const want = norm(place.name || place.query);
  const texts = [];
  for (let i = 0; i < n; i++) texts.push(norm(await items.nth(i).innerText().catch(() => '')));
  let idx = texts.findIndex((t) => t.split('\n')[0] === want || t.startsWith(want));
  if (idx < 0) idx = texts.findIndex((t) => t.includes(want));
  if (idx < 0) idx = 0;

  const item = items.nth(idx);
  await item.hover();
  await sleep(300);
  const add = item.locator('button').filter({ hasText: '추가' }).first();
  try {
    await add.click({ timeout: 3000 });
  } catch {
    await add.evaluate((el) => el.click()); // hover 전 not visible 폴백
  }
  await sleep(500);
  const confirm = popup.locator('button').filter({ hasText: /^확인$/ }).last();
  await confirm.click({ timeout: 5000 });
  await sleep(1000);
  if (await popup.isVisible().catch(() => false)) await closePlacePopup(popup);
  await removeDim(frame);
  return `성공 (${idx === 0 && !texts[0].includes(want) ? '첫 결과 선택 — 확인 필요' : '일치 결과 선택'})`;
}

async function closePlacePopup(popup) {
  // 장소 팝업은 Escape로 안 닫힌다 → 닫기 버튼
  await popup.locator('button[class*="close"]').first().click({ timeout: 3000 }).catch(() => {});
  await sleep(300);
  await removeDim(frame);
}

// ---------- 제목 ----------

async function readTitle() {
  return (await frame.locator(TITLE).first().innerText().catch(() => '')).trim();
}

async function writeTitle() {
  for (let attempt = 1; attempt <= 3; attempt++) {
    const t = frame.locator(TITLE).first();
    await t.click();
    await page.keyboard.press('Control+A');
    await page.keyboard.press('Backspace');
    await sleep(200);
    await insertTextSafe(page, draft.title);
    await sleep(500);
    if (norm(await readTitle()) === norm(draft.title)) return `성공 (${attempt}회차)`;
    console.warn(`  ⚠ 제목 불일치 (${attempt}회차) → 재입력`);
  }
  throw new Error('제목 3회 입력 실패');
}

// ---------- 태그 (발행 패널 — 가드 전제) ----------

async function writeTags() {
  const tags = [...new Set(draft.tags.map((t) => String(t).replace(/^#+/, '').trim()).filter(Boolean))].slice(0, 30);
  await assertGuard(page);
  const scopes = [frame, page.mainFrame()];
  let opener = null;
  for (const s of scopes) {
    opener = await firstVisible(s, ['button[class*="publish_btn"]:not([data-testid="seOnePublishBtn"])'], 1500);
    if (!opener) {
      const byText = s.locator('button:not([data-testid="seOnePublishBtn"])').filter({ hasText: /^발행$/ }).first();
      if ((await byText.count()) && (await byText.isVisible().catch(() => false))) opener = byText;
    }
    if (opener) break;
  }
  if (!opener) throw new Error('발행 패널 여는 버튼 없음');
  await opener.click();
  await sleep(1000);
  await installPublishGuard(page); // 패널 DOM 생성 후 재확인

  let input = null;
  for (const s of scopes) {
    input = await firstVisible(s, ['input#tag-input'], 3000);
    if (input) break;
  }
  if (!input) throw new Error('태그 입력란(input#tag-input) 없음');
  for (const tag of tags) {
    await input.click();
    await insertTextSafe(page, tag);
    await page.keyboard.press('Enter');
    await sleep(250);
  }
  // 검증: 태그 영역 텍스트를 #로 쪼개 센다 (칩 클래스 해시 의존 금지)
  const areaText = await input.evaluate((el) => {
    let p = el.parentElement;
    for (let i = 0; i < 4 && p && !p.innerText.includes('#'); i++) p = p.parentElement;
    return p ? p.innerText : '';
  });
  const found = areaText.split('#').map((s) => s.trim().split(/\s/)[0]).filter(Boolean);
  const missing = tags.filter((t) => !found.some((f) => norm(f) === norm(t)));
  await page.keyboard.press('Escape'); // 패널만 닫기
  await sleep(800);
  if (missing.length) return `❗일부 수동 필요 (누락: ${missing.join(', ')})`;
  return `성공 (${tags.length}개)`;
}

// ---------- 저장 / 검증 ----------

async function clickSave() {
  for (const s of [frame, page.mainFrame()]) {
    const btn = await firstVisible(s, ['button[class*="save_btn"]'], 2000);
    if (btn) {
      await btn.click();
      return;
    }
    const byText = s.locator('button').filter({ hasText: /^저장$/ }).first();
    if ((await byText.count()) && (await byText.isVisible().catch(() => false))) {
      await byText.click();
      return;
    }
  }
  throw new Error('임시저장 버튼 없음');
}

async function dumpEditor() {
  const title = await readTitle();
  const body = await frame.evaluate(() => {
    const wrap = document.querySelector('.se-components-wrap') || document.querySelector('.se-content') || document.body;
    const clone = wrap.cloneNode(true);
    clone.querySelectorAll('.se-documentTitle, .se-title-text').forEach((el) => el.remove());
    return clone.innerText;
  });
  return { title, body };
}

function verifyAgainstDraft(dump) {
  const problems = [];
  if (norm(dump.title) !== norm(draft.title)) problems.push(`제목 불일치: "${dump.title}"`);
  const bodyN = norm(dump.body);
  let pos = 0;
  for (const [i, b] of draft.blocks.entries()) {
    if (!['text', 'subtitle', 'quote'].includes(b.type)) continue;
    for (const line of String(b.text).split('\n').filter((l) => l.trim())) {
      const ln = norm(line);
      const at = bodyN.indexOf(ln, pos);
      if (at < 0) {
        problems.push(`블록 ${i}(${b.type}) 누락/불일치: "${line.slice(0, 30)}"`);
      } else {
        pos = at + ln.length;
      }
    }
  }
  return problems;
}

async function fixFirstLine() {
  const first = draft.blocks.find((b) => b.type === 'text');
  if (!first) return;
  const head = norm(String(first.text).split('\n')[0]).slice(0, 10);
  const { body } = await dumpEditor();
  if (norm(body).includes(head)) return;
  console.warn('  ⚠ 본문 첫 줄 누락 감지 → 맨 앞에 보정 삽입');
  await frame.locator(BODY_P).first().click();
  await page.keyboard.press('Home');
  await insertTextSafe(page, String(first.text).split('\n')[0]);
}

function writeManual() {
  const lines = [`제목: ${draft.title}`, '', `태그: ${(draft.tags || []).map((t) => '#' + t).join(' ')}`, ''];
  for (const b of draft.blocks) {
    if (b.type === 'text') lines.push(b.text, '');
    if (b.type === 'subtitle') lines.push(`【소제목】 ${b.text}`, '');
    if (b.type === 'quote') lines.push(`【인용구】 ${b.text}`, '');
    if (b.type === 'divider') lines.push('【구분선】', '');
    if (b.type === 'image') lines.push(`【사진】 ${b.path}${b.caption ? ' / 캡션: ' + b.caption : ''}`, '');
  }
  if (draft.video) lines.push(`【동영상 — 첫 문단 뒤】 ${draft.video.path} / 제목: ${draft.video.title || ''}`);
  if (draft.place) lines.push(`【지도 — 글 맨 끝】 ${draft.place.name || draft.place.query}`);
  const p = path.join(OUT_DIR, `${NAME}.manual.txt`);
  fs.writeFileSync(p, lines.join('\n'));
  return path.relative(ROOT, p);
}

function printResult() {
  console.log('\n===== 자동 처리 결과 =====');
  for (const [k, v] of Object.entries(result)) console.log(`${k}: ${v}`);
  if (manual.length) {
    console.log('\n❗수동 필요 항목:');
    manual.forEach((m) => console.log(`- ${m}`));
  }
  console.log('==========================');
}

// ---------- 메인 ----------

async function run() {
  const launched = await launch();
  page = launched.page;
  const context = launched.context;
  try {
    await page.goto(WRITE_URL, { waitUntil: 'domcontentloaded' });
    await sleep(5000);
    if (page.url().includes('nidlogin')) throw new Error('로그인 세션 만료 — /setup-login 을 먼저 실행하세요.');
    frame = await getEditorFrame(page);
    await frame.waitForSelector(TITLE, { timeout: 30000 });
    await installPublishGuard(page); // 에디터 로드 직후 가드 설치 (절대 규칙 2)
    await closeStartupPopups();

    // 1) 본문 전체 먼저
    await frame.locator(BODY_P).first().click();
    let images = 0;
    let videoDone = false;
    let blockFails = 0;
    for (let i = 0; i < draft.blocks.length; i++) {
      const b = draft.blocks[i];
      const next = draft.blocks[i + 1];
      process.stdout.write(`  [${i + 1}/${draft.blocks.length}] ${b.type}\n`);
      try {
        if (b.type === 'text') {
          await typeLines(b.text);
          await page.keyboard.press('Enter');
          if (next && next.type === 'text') await page.keyboard.press('Enter');
          if (!videoDone && draft.video) {
            videoDone = true;
            try {
              await insertVideo(draft.video);
              result.동영상 = '성공';
            } catch (e) {
              result.동영상 = `❗수동 필요 (${e.message})`;
              manual.push(`동영상 첨부(첫 문단 뒤): ${draft.video.path}`);
              await removeDim(frame);
              await focusEnd();
            }
          }
        } else if (b.type === 'subtitle') {
          await insertSubtitle(b.text);
        } else if (b.type === 'image') {
          await insertImage(b);
          images++;
        } else if (b.type === 'quote') {
          await insertQuote(b.text);
        } else if (b.type === 'divider') {
          await insertDivider();
        }
      } catch (e) {
        blockFails++;
        console.warn(`  ❌ 블록 ${i} 실패: ${e.message}`);
        manual.push(`블록 ${i}(${b.type}) 수동 확인: ${b.text || b.path || ''}`.slice(0, 120));
        await page.keyboard.press('Escape').catch(() => {});
        await removeDim(frame);
        await focusEnd().catch(() => {});
        if (blockFails >= 3) throw new Error('블록 입력 3회 실패 — 셀렉터 점검 필요');
      }
    }
    const imgTotal = draft.blocks.filter((b) => b.type === 'image').length;
    result.사진 = `${images}/${imgTotal}장`;
    const subTotal = draft.blocks.filter((b) => b.type === 'subtitle').length;
    result.소제목 = subtitleFails ? `❗${subtitleFails}/${subTotal}개 서식 실패 (텍스트는 입력됨)` : `성공 (${subTotal}개)`;
    if (subtitleFails) manual.push('소제목 서식(소제목·19) 수동 적용');
    result.본문 = blockFails ? `⚠ ${blockFails}개 블록 실패` : '성공';

    // 2) 지도 — 글 맨 끝
    if (draft.place) {
      try {
        await focusEnd();
        result.지도 = await insertPlace(draft.place);
        if (result.지도.startsWith('❗')) manual.push(`지도 수동 첨부: ${draft.place.name || draft.place.query}`);
      } catch (e) {
        result.지도 = `❗수동 필요 (${e.message})`;
        manual.push(`지도 수동 첨부: ${draft.place.name || draft.place.query}`);
        await removeDim(frame);
      }
    }

    // 3) 제목 — 맨 마지막
    result.제목 = await writeTitle();
    await fixFirstLine();

    // 4) 태그 (발행 패널 — 가드가 진짜 발행 차단)
    if (draft.tags && draft.tags.length) {
      try {
        result.태그 = await writeTags();
      } catch (e) {
        result.태그 = `❗수동 필요 (${e.message})`;
        await page.keyboard.press('Escape').catch(() => {});
      }
      if (result.태그.startsWith('❗')) manual.push(`태그 수동 입력: ${draft.tags.map((t) => '#' + t).join(' ')}`);
    }

    // 5) 임시저장
    if (!DRY_RUN) {
      await assertGuard(page);
      await clickSave();
      await sleep(3000);
      result.임시저장 = '클릭 완료';
    }

    // 6) 이중 검증: 스크린샷 + 전문 텍스트 대조
    await page.screenshot({ path: path.join(OUT_DIR, `${NAME}.png`) });
    const dump = await dumpEditor();
    fs.writeFileSync(path.join(OUT_DIR, `${NAME}.dump.txt`), `# TITLE\n${dump.title}\n\n# BODY\n${dump.body}`);
    const problems = verifyAgainstDraft(dump);
    result.텍스트대조 = problems.length ? `❌ 불일치 ${problems.length}건` : '✅ 전문 일치';
    printResult();
    if (problems.length) {
      console.log('\n불일치 상세:');
      problems.forEach((p) => console.log(`- ${p}`));
      console.log(`\n수동 붙여넣기 원고: ${writeManual()}`);
      process.exitCode = 2;
    }
  } catch (e) {
    console.error('❌ 중단:', e.message);
    printResult();
    console.log(`수동 붙여넣기 원고: ${writeManual()}`);
    try {
      await page.screenshot({ path: path.join(OUT_DIR, `${NAME}.error.png`) });
    } catch {}
    process.exitCode = 1;
  } finally {
    await sleep(1500);
    await context.close();
  }
}

run();
