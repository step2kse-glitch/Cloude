// 네이버 로그인 1회. 사용자가 열린 브라우저에서 직접 로그인(패스키 가능).
// 비밀번호는 저장하지 않으며, 세션 쿠키만 naver-profile/ 에 남는다.
const { launch, sleep } = require('./lib/common');

(async () => {
  const { context, page } = await launch();
  await page.goto('https://nid.naver.com/nidlogin.login?url=https%3A%2F%2Fblog.naver.com');
  console.log('브라우저에서 직접 로그인해 주세요. (최대 5분 대기)');

  const deadline = Date.now() + 5 * 60 * 1000;
  let ok = false;
  while (Date.now() < deadline) {
    const cookies = await context.cookies('https://naver.com');
    if (cookies.some((c) => c.name === 'NID_AUT') && cookies.some((c) => c.name === 'NID_SES')) {
      ok = true;
      break;
    }
    await sleep(2000);
  }

  if (!ok) {
    console.log('❌ 로그인 확인 실패 (시간 초과). 다시 /setup-login 을 실행하세요.');
    await context.close();
    process.exit(1);
  }

  await page.goto('https://blog.naver.com/GoBlogWrite.naver');
  await sleep(3000);
  console.log('✅ 로그인 세션 저장 완료 (naver-profile/). 이 폴더는 외부 공유 금지.');
  await context.close();
})().catch((e) => {
  console.error('❌ 오류:', e.message);
  process.exit(1);
});
