// 주소 → 좌표 (지도 표시용). 카카오 REST 키가 있으면 카카오(한국 주소 정확), 없으면 OpenStreetMap(무료, 덜 정확).
// 결과는 케이스의 geo {lat, lng, source, approx, query} 에 저장해 다시 묻지 않는다.
const fs = require('fs');
const path = require('path');
const { PATHS } = require('./lib/util');

const LOCAL = path.join(PATHS.workspace, 'settings.local.json'); // 개인 키 보관 (커밋 안 됨)
const readLocal = () => {
  try {
    return JSON.parse(fs.readFileSync(LOCAL, 'utf8'));
  } catch {
    return {};
  }
};
const writeLocal = (patch) => {
  const next = { ...readLocal(), ...patch };
  fs.mkdirSync(path.dirname(LOCAL), { recursive: true });
  fs.writeFileSync(LOCAL, JSON.stringify(next, null, 2));
  return next;
};

// "경기도 고양시 덕양구 내유동 738-1 진흥타운 4층402호" → "경기도 고양시 덕양구 내유동 738-1"
// "서울특별시 영등포구 도림천로19길 12, 제9층 제901호 (대림동, …)" → "서울특별시 영등포구 도림천로19길 12"
function cleanAddress(addr) {
  const s = String(addr || '')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/,/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const tokens = s.split(' ');
  const out = [];
  for (const t of tokens) {
    out.push(t);
    if (/^(산\s?)?\d+(-\d+)?(번지)?$/.test(t)) break; // 지번·건물번호에서 멈춤 (동·층·호 제외)
  }
  // 숫자 지번이 없으면 동·층·호처럼 보이는 토큰부터 잘라냄
  const cut = out.findIndex((t) => /\d+(층|호)$|^제\d+|\d+동$/.test(t));
  return (cut > 0 ? out.slice(0, cut) : out).join(' ');
}

async function kakao(query, key) {
  const r = await fetch(`https://dapi.kakao.com/v2/local/search/address.json?query=${encodeURIComponent(query)}`, { headers: { Authorization: `KakaoAK ${key}` } });
  if (!r.ok) throw new Error(`카카오 응답 ${r.status} (REST 키 확인)`);
  const d = await r.json();
  const hit = d.documents && d.documents[0];
  return hit ? { lat: Number(hit.y), lng: Number(hit.x) } : null;
}

async function osm(query) {
  const r = await fetch(`https://nominatim.openstreetmap.org/search?format=json&countrycodes=kr&limit=1&q=${encodeURIComponent(query)}`, {
    headers: { 'User-Agent': 'auction-assistant/1.0 (personal use)', 'Accept-Language': 'ko' },
  });
  if (!r.ok) throw new Error(`OpenStreetMap 응답 ${r.status}`);
  const d = await r.json();
  return d[0] ? { lat: Number(d[0].lat), lng: Number(d[0].lon) } : null;
}

// 정확한 주소로 못 찾으면 뒤에서부터 한 단어씩 줄여 동네 단위까지 시도 (approx 표시)
async function geocode(address, { key = readLocal().kakaoRestKey, finder } = {}) {
  const base = cleanAddress(address);
  if (!base) return null;
  const find = finder || ((q) => (key ? kakao(q, key) : osm(q)));
  const tokens = base.split(' ');
  for (let n = tokens.length, tries = 0; n >= 2 && tries < 4; n--, tries++) {
    const q = tokens.slice(0, n).join(' ');
    const hit = await find(q);
    if (hit) return { ...hit, source: key && !finder ? '카카오' : finder ? '테스트' : 'OpenStreetMap', approx: n < tokens.length, query: q };
    if (!finder && !key) await new Promise((r) => setTimeout(r, 1100)); // OSM 이용 정책: 초당 1회
  }
  return null;
}

module.exports = { geocode, cleanAddress, readLocal, writeLocal };
