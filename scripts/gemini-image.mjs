// 구글 제미나이(나노바나나)로 카드뉴스 배경 이미지를 바로 만든다.
//
// 사용법:
//   GEMINI_API_KEY=... node scripts/gemini-image.mjs --file series/1john-image-prompts.txt --id 1jn
//       → 프롬프트 파일의 [NN편 표지] / [NN편 7번째 장] 을 읽어
//         carousel/images/1jn-NN-cover.png, 1jn-NN-key.png 로 저장 (이미 있으면 건너뜀)
//   GEMINI_API_KEY=... node scripts/gemini-image.mjs --prompt "..." --out carousel/images/test.png
//
// 옵션: --only 03 (특정 편만), --force (있어도 다시 생성), --model <모델명>, --ratio 4:5
// 키는 Google AI Studio(aistudio.google.com)에서 발급한다. 저장소에 넣지 않는다.
import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const arg = (name) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const key = process.env.GEMINI_API_KEY;
if (!key) {
  console.error('GEMINI_API_KEY 환경 변수가 없습니다.');
  process.exit(1);
}
const model = arg('model') ?? 'gemini-2.5-flash-image';
const ratio = arg('ratio') ?? '4:5';
const force = process.argv.includes('--force');

// Node fetch는 프록시 설정을 따르지 않아서 curl로 호출하고, 큰 응답은 파일로 받는다.
function generate(prompt, out) {
  const req = path.join(tmpdir(), `gemini-req-${process.pid}.json`);
  const res = path.join(tmpdir(), `gemini-res-${process.pid}.json`);
  writeFileSync(req, JSON.stringify({
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { responseModalities: ['IMAGE'], imageConfig: { aspectRatio: ratio } },
  }));
  execFileSync('curl', ['-sS', '-X', 'POST',
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    '-H', `x-goog-api-key: ${key}`, '-H', 'Content-Type: application/json',
    '--data-binary', `@${req}`, '-o', res]);
  const body = JSON.parse(readFileSync(res, 'utf8'));
  rmSync(req, { force: true });
  rmSync(res, { force: true });
  if (body.error) throw new Error(`${body.error.message} (${body.error.status})`);
  const part = body.candidates?.[0]?.content?.parts?.find((p) => p.inlineData);
  if (!part) throw new Error(`이미지가 오지 않았습니다: ${JSON.stringify(body).slice(0, 300)}`);
  mkdirSync(path.dirname(out), { recursive: true });
  writeFileSync(out, Buffer.from(part.inlineData.data, 'base64'));
  console.log('✓', path.relative(root, out));
}

const single = arg('prompt');
if (single) {
  generate(single, path.resolve(root, arg('out') ?? 'carousel/images/gemini-test.png'));
  process.exit(0);
}

const file = arg('file');
const id = arg('id');
if (!file || !id) {
  console.error('사용법: node scripts/gemini-image.mjs --file <프롬프트 파일> --id <접두어> [--only NN] [--force]');
  process.exit(1);
}
// [01편 표지] / [01편 7번째 장] 머리글 다음 줄이 프롬프트다.
const lines = readFileSync(path.resolve(root, file), 'utf8').split('\n');
const jobs = [];
for (let i = 0; i < lines.length; i++) {
  const m = lines[i].match(/^\[(\d+)편 (표지|7번째 장)\]$/);
  if (m && lines[i + 1]?.trim()) jobs.push({ n: m[1], kind: m[2] === '표지' ? 'cover' : 'key', prompt: lines[i + 1].trim() });
}
const only = arg('only');
for (const j of jobs.filter((j) => !only || j.n === only)) {
  const out = path.join(root, 'carousel/images', `${id}-${j.n}-${j.kind}.png`);
  if (existsSync(out) && !force) {
    console.log('· 건너뜀 (이미 있음)', path.relative(root, out));
    continue;
  }
  try {
    generate(j.prompt, out);
  } catch (e) {
    console.error(`✗ ${j.n}편 ${j.kind}: ${e.message}`);
    process.exitCode = 1;
  }
}
