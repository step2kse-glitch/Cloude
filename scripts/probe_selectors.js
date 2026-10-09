// 셀렉터 진단용 DOM 덤프 — 읽기 전용 (클릭·입력·저장 안 함).
// 사용법:
//   node scripts/probe_selectors.js                 에디터 로드 후 버튼/입력란 목록 덤프
//   node scripts/probe_selectors.js --wait 60       60초 동안 사용자가 직접 팝업·패널을 열어두면 그 상태를 덤프
//   node scripts/probe_selectors.js --sel ".se-popup"  특정 셀렉터의 outerHTML 덤프
const fs = require('fs');
const path = require('path');
const { ROOT, WRITE_URL, launch, sleep, installPublishGuard, ensureDir } = require('./lib/common');

const args = process.argv.slice(2);
const argVal = (k) => (args.includes(k) ? args[args.indexOf(k) + 1] : null);
const waitSec = Number(argVal('--wait') || 0);
const sel = argVal('--sel');

(async () => {
  const { context, page } = await launch();
  await page.goto(WRITE_URL);
  await sleep(6000);
  await installPublishGuard(page); // 사용자가 수동으로 눌러도 발행되지 않게

  if (waitSec) {
    console.log(`${waitSec}초 대기 — 진단하고 싶은 팝업/패널을 브라우저에서 직접 열어두세요.`);
    await sleep(waitSec * 1000);
  }

  const dump = { url: page.url(), at: new Date().toISOString(), frames: [] };
  for (const frame of page.frames()) {
    try {
      const info = await frame.evaluate((sel) => {
        const pick = (el) => ({
          tag: el.tagName.toLowerCase(),
          id: el.id || undefined,
          cls: (el.className && el.className.baseVal === undefined ? el.className : '') || undefined,
          testid: el.getAttribute('data-testid') || undefined,
          name: el.getAttribute('data-name') || undefined,
          placeholder: el.getAttribute('placeholder') || undefined,
          text: (el.innerText || el.value || '').trim().slice(0, 40) || undefined,
          visible: !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length),
          disabled: el.disabled || undefined,
        });
        return {
          buttons: [...document.querySelectorAll('button, [role="button"]')].map(pick),
          inputs: [...document.querySelectorAll('input, textarea, [contenteditable="true"]')].map(pick),
          popups: [...document.querySelectorAll('[class*="popup"], [class*="layer"], [class*="dim"]')].map(pick).slice(0, 200),
          selected: sel ? [...document.querySelectorAll(sel)].map((el) => el.outerHTML.slice(0, 20000)) : undefined,
        };
      }, sel);
      dump.frames.push({ name: frame.name(), url: frame.url(), ...info });
    } catch (e) {
      dump.frames.push({ name: frame.name(), url: frame.url(), error: e.message });
    }
  }

  ensureDir(path.join(ROOT, 'drafts'));
  const out = path.join(ROOT, 'drafts', `probe-${Date.now()}.json`);
  fs.writeFileSync(out, JSON.stringify(dump, null, 2));
  await page.screenshot({ path: out.replace(/\.json$/, '.png') });
  console.log(`DOM 덤프 저장: ${path.relative(ROOT, out)} (+ 스크린샷)`);
  await context.close();
})().catch((e) => {
  console.error('❌ 오류:', e.message);
  process.exit(1);
});
