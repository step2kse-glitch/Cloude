// 물건 위험·특징 태그 (#대항력있는임차인 #재매각 …) — analyze 결과와 케이스 사실에서만 만든다
const TAG_LEVEL = { bad: '위험', warn: '주의', info: '정보', good: '장점' };

function tags(c, a) {
  const out = [];
  const add = (text, level) => out.push({ text, level });
  const fail = Number(c.failCount || 0);
  if (fail === 0) add('신건', 'info');
  else add(`유찰${fail}회`, fail >= 3 ? 'warn' : 'info');
  if (c.appraisal && c.minPrice && c.minPrice / c.appraisal <= 0.5) add('반값이하', 'good');

  const flags = (c.flags || []).join(' ');
  if (/재매각/.test(flags)) add('재매각', 'warn');
  if (/지분/.test(flags)) add('지분매각', 'bad');
  if (/대지권/.test(flags)) add('대지권미등기', 'bad');
  if (/토지별도/.test(flags)) add('토지별도등기', 'warn');
  if (/위반건축/.test(flags)) add('위반건축물', 'warn');
  if (/농취|농지/.test(flags)) add('농취증필요', 'warn');

  if (a) {
    for (const r of a.rights) {
      if (r.status === '인수') {
        if (/임차권/.test(r.type)) add('선순위임차권', 'bad');
        else if (/전세권/.test(r.type)) add('선순위전세권', 'bad');
        else if (/가처분/.test(r.type)) add('선순위가처분', 'bad');
        else if (/가등기/.test(r.type)) add('선순위가등기', 'bad');
        else add(`선순위${r.type}`, 'bad');
      }
      if (r.status === '위험') add(r.type.replace(/\s/g, ''), 'bad');
    }
    const opp = a.tenants.filter((t) => t.opposable);
    if (opp.length) add('대항력있는임차인', a.assumedAtRecommended === 0 ? 'warn' : 'bad');
    if (a.smallTenantRule && a.distribution.log.some((l) => l.step.startsWith('최우선') && l.amount > 0)) add('소액임차인', 'info');
    // 서류를 아직 안 옮긴 빈 물건에 '임차인없음'을 붙이지 않도록 등기 정보가 있을 때만
    if (!a.tenants.length && !c.tenantsUnknown && (c.registry || []).length) add('임차인없음', 'good');
  }
  if (c.tenantsUnknown) add('점유자미확인', 'warn');
  if (/소유자|채무자/.test(String(c.occupant || ''))) add('소유자점유', 'info');
  // 중복 제거 (처음 나온 것 유지)
  const seen = new Set();
  return out.filter((t) => (seen.has(t.text) ? false : seen.add(t.text)));
}

module.exports = { tags, TAG_LEVEL };
