import { writeFileSync, readFileSync } from 'node:fs';
const root = '/home/user/Cloude';
const night = { type: 'night', kicker: '오늘도 복음', big: '오늘도\n복음으로\n', win: '승리!', body: '팔로우하고 내일의 복음도 함께해요', logo: 'brand/thinking-atelier-logo-transparent.png' };
const V33 = '너희는 우리로 말미암아 나타난\n그리스도의 편지니\n이는 먹으로 쓴 것이 아니요\n오직 살아 계신 하나님의 영으로\n쓴 것이며\n또 돌판에 쓴 것이 아니요\n오직 육의 마음판에 쓴 것이라';
const eps = {
  '01': { label: '직함이 아니라 직분', slides: [
    { type: 'cover', kicker: '오늘도 복음', title: '아무도 내게\n명함을\n주지 않았다', sub: 'INK – 하나님의 잉크로 새긴 편지\n고린도후서 5:18' },
    { type: 'text', title: '명함을\n주고받던 자리', body: '장학금을 받으러 간 자리,\n아홉 명이 서로 명함을 주고받았습니다.\n과장님, 부장님, 팀장님….\n\n그런데 제게 명함을 건넨 사람은\n아무도 없었습니다.\n8년을 일했지만 세상이 보는 제 자리는\n\'직원 1\'이었습니다.' },
    { type: 'phrase', kicker: '그때 들려온 마음', phrase: '직함이 아니라\n직분이다', body: '"내가 너를 세상에 부르고\n이 세상에 둔 목적은\n직함이 아니라 직분이다."\n\n하나님은 우리에게\n화목하게 하는 직분을 주셨습니다.' },
    { type: 'quote', kicker: '오늘의 말씀', quote: '모든 것이 하나님께로 났으며\n그가 그리스도로 말미암아\n우리를 자기와 화목하게 하시고\n또 우리에게\n화목하게 하는 직분을 주셨으니', cite: '고린도후서 5:18 (개역개정)' },
    { type: 'phrase', kicker: '오늘 나에게', phrase: '직함으로 대했나요,\n직분으로 대했나요?', body: '배우자와 자녀에게, 일터의 동료에게,\n학교의 친구에게\n오늘 나는 어떤 메시지를 남겼을까요?' },
  ] },
  '02': { label: '한 문장의 메시지', slides: [
    { type: 'cover', kicker: '오늘도 복음', title: '나는 어떤\n메시지로\n살아갈 것인가', sub: 'INK – 하나님의 잉크로 새긴 편지\n고린도후서 5:19–20' },
    { type: 'text', title: '오늘 남긴\n말 한마디', body: '오늘 교회 오기 전,\n가족과 동료에게 남긴 말은 무엇이었나요?\n\n그들의 마음에 남은 건\n화목하게 하는 메시지였을까요,\n아니면 힘들게 하는 말이었을까요?' },
    { type: 'phrase', kicker: '한 페이지, 한 문장', phrase: '내 삶을\n한 문장으로 줄인다면', body: '내 삶을 한 페이지로, 다시 한 문장으로\n줄였을 때 어떤 문장이 남게 될까요?\n\n누군가를 정죄하는 문장일까요,\n하나님과 화목하게 하는 문장일까요?' },
    { type: 'quote', kicker: '오늘의 말씀', quote: '곧 하나님께서 그리스도 안에 계시사\n세상을 자기와 화목하게 하시며\n그들의 죄를 그들에게\n돌리지 아니하시고\n화목하게 하는 말씀을\n우리에게 부탁하셨느니라', cite: '고린도후서 5:19 (개역개정)' },
    { type: 'phrase', kicker: '그래도 기대합니다', phrase: '하나님이 지금도\n쓰고 계십니다', body: '우리의 힘으로 쓰는 문장이 아닙니다.\n하나님께서 성령으로 우리 마음판에\n화목의 메시지를 지금도 쓰고 계십니다.\n\n오늘 어떤 메시지로 살아가셨나요?' },
  ] },
  '03': { label: '영원한 잉크', slides: [
    { type: 'cover', kicker: '오늘도 복음', title: '만년필은 왜\n만년필일까?', sub: 'INK – 하나님의 잉크로 새긴 편지\n고린도후서 3:3' },
    { type: 'text', title: '20년 쓴\n만년필', body: '첫 사역지에서 담임목사님이\n만년필로 설교문을 쓰시는 걸 보고\n스무 살에 저도 만년필을 샀습니다.\n\n만 년을 간다는 이름처럼\n그 글씨도 오래 남을 줄 알았습니다.' },
    { type: 'text', title: '그런데\n잉크는', body: '물 한 방울에 번지고\n세월이 지나면 누렇게 바랬습니다.\n\n좋은 잉크든 나쁜 잉크든\n세상의 잉크에는 한계가 있습니다.' },
    { type: 'phrase', kicker: '하나님의 잉크', phrase: '지워지지 않는\n영원한 잉크', body: '하나님은 우리 마음판에\n먹이 아니라 살아 계신 하나님의 영으로\n그리스도의 편지를 쓰십니다. (고후 3:3)\n\n세상의 잉크는 다 날아가도\n그 글씨는 사라지지 않습니다.' },
    { type: 'phrase', kicker: '오늘 나에게', phrase: '내 마음에\n지워지지 않고 남은\n말씀이 있나요?', body: '오늘 하루를 붙들어 준 한 구절을\n댓글로 나눠 주세요.' },
  ] },
  '04': { label: '약함의 복음', slides: [
    { type: 'cover', kicker: '오늘도 복음', title: '봉투는 찢겨도\n편지는\n온전하다', sub: 'INK – 하나님의 잉크로 새긴 편지\n고린도후서 4:7' },
    { type: 'text', title: '험한 길을\n지난 봉투', body: '추천서를 봉투에 넣어 험한 곳으로 보냅니다.\n비바람에 젖고, 짓밟히고, 찢기고,\n봉투인지 쓰레기인지 모를 만큼\n망가졌습니다.\n\n우리 인생도 그럴 때가 있습니다.\n상처로 찢기고 실패로 얼룩진 날들.' },
    { type: 'phrase', kicker: '그러나', phrase: '봉투 안의 편지는\n훼손되지 않았다', body: '바울은 버림받고, 매 맞고, 굶고,\n파선을 당했습니다.\n그러나 그 안의 편지는 지워지지 않았습니다.\n\n우리의 약함 때문에\n그 메시지는 더욱 강해집니다.' },
    { type: 'quote', kicker: '오늘의 말씀', quote: '우리가 이 보배를\n질그릇에 가졌으니\n이는 심히 큰 능력은\n하나님께 있고\n우리에게 있지 아니함을\n알게 하려 함이라', cite: '고린도후서 4:7 (개역개정)' },
    { type: 'phrase', kicker: '오늘 나에게', phrase: '찢어진 틈으로\n빛이 새어 나옵니다', body: '내 봉투가 찢어지고 구멍이 날 때\n그 틈으로 예수 그리스도의 빛이\n전해지기를 기도합니다.' },
  ] },
  '05': { label: '바울의 추천서', slides: [
    { type: 'cover', kicker: '오늘도 복음', title: '저인 듯,\n제가 아닌\n추천서', sub: 'INK – 하나님의 잉크로 새긴 편지\n고린도후서 3:2' },
    { type: 'text', title: '감당이\n안 됩니다', body: '내가 그리스도의 편지라니.\n묵상할수록 솔직한 고백이 나옵니다.\n"주님, 저는 그거 감당이 안 됩니다."\n\n내세울 것 없고 흠투성이인 삶인데\n어떻게 세상에 추천서로 나아갈까요?' },
    { type: 'phrase', kicker: '바울의 추천서', phrase: '너희가\n나의 추천서다', body: '바울에게도 내세울 증명서가 많았습니다.\n로마 시민, 바리새인, 사도들과의 교제.\n그러나 그는 그것을 말하지 않았습니다.\n\n복음으로 변화된 성도들의 삶이\n곧 그의 추천서였기 때문입니다.' },
    { type: 'quote', kicker: '오늘의 말씀', quote: '너희는 우리의 편지라\n우리 마음에 썼고\n뭇 사람이 알고\n읽는 바라', cite: '고린도후서 3:2 (개역개정)' },
    { type: 'phrase', kicker: '오늘 나에게', phrase: '오늘 사람들은\n내 삶에서\n누구를 읽었을까요?', body: '하나님은 흠 많은 우리 마음에도\n아낌없이 그리스도의 이름을 쓰시고\n그분의 인장을 찍어 주셨습니다.' },
  ] },
  '06': { label: '이력서가 아니라 편지', slides: [
    { type: 'cover', kicker: '오늘도 복음', title: '나는 그리스도의\n편지라 불릴 수\n있을까?', sub: 'INK – 하나님의 잉크로 새긴 편지\n고린도후서 3:3' },
    { type: 'text', title: '이런 마음이\n들 때', body: '내가 하나님의 영광을 가리면 어떡하지?\n내가 예수 그리스도의 얼굴에\n먹칠을 하면 어떡하지?\n\n우리는 그런 마음이 들 때가 있습니다.' },
    { type: 'phrase', kicker: '기억하세요', phrase: '이력서가 아니라\n편지입니다', body: '우리는 나를 증명하는 이력서를\n내미는 사람이 아닙니다.\n하나님께서 마음판에 쓰신\n그리스도의 편지를 가지고 사는 사람입니다.' },
    { type: 'phrase', kicker: '편지의 필자', phrase: '쓰시는 분은\n하나님이십니다', body: '편지의 필자는 우리가 아니라\n지금도 살아 계신 하나님이십니다.\n\n세상에 나아갈 때 필요한 건\n이력서나 자소서가 아니라\n성령으로 쓰신 그 편지입니다.' },
    { type: 'phrase', kicker: '오늘 나에게', phrase: '오늘 하루,\n그리스도의 편지로\n살아가셨나요?', body: '내 삶을 한 문장으로 줄인다면\n어떤 문장이 남을까요?' },
  ] },
  '07': { label: '보너스 · 기도', slides: [
    { type: 'cover', kicker: '오늘도 복음', title: '새 봉투가 아니라\n그리스도의\n생명을', sub: 'INK – 하나님의 잉크로 새긴 편지\n보너스 · 함께 드리는 기도' },
    { type: 'text', title: '우리가 자주\n드리는 기도', body: '"하나님, 나의 봉투를\n새것으로 만들어 주세요."\n\n찢긴 봉투가 새것이 되기를,\n형편이 좋아지기를\n우리는 자주 이렇게 기도합니다.' },
    { type: 'phrase', kicker: '이렇게 기도합니다', phrase: '나를 통해\n그리스도의 생명이\n나타나게 하소서', body: '봉투를 새것으로 만드는 기도가 아니라\n우리의 약함 속에서도\n하나님의 생명이 나타나게 해 달라는 기도.' },
    { type: 'quote', kicker: '오늘의 말씀', quote: '우리가 항상\n예수의 죽음을\n몸에 짊어짐은\n예수의 생명이 또한\n우리 몸에 나타나게\n하려 함이라', cite: '고린도후서 4:10 (개역개정)' },
    { type: 'prayer', kicker: '함께 드리는 기도', body: '하나님, 나의 봉투가 찢기고\n더러워져도\n그 틈으로 예수 그리스도의\n생명이 나타나게 하소서.\n화목하게 하는 직분으로\n오늘을 살게 하소서.' },
  ] },
};
for (const [n, e] of Object.entries(eps)) {
  const id = `ink-cn-${n}`;
  const ep = { id, series: '오늘도 복음', label: e.label, skin: 'leather', slides: [...e.slides, night] };
  writeFileSync(`${root}/carousel/episodes/${id}.json`, JSON.stringify(ep, null, 2) + '\n');
  // 캡션: 같은 편 릴스 캡션에 저장 권유 한 줄을 더한다.
  const reel = readFileSync(`${root}/carousel/episodes/reel-ink-${n}.caption.txt`, 'utf8');
  const cap = reel.replace('\n\n오늘도 복음으로 승리!', '\n🔖 저장해 두고 다시 꺼내 보세요.\n\n오늘도 복음으로 승리!').replace('#복음설교', '#복음설교 #카드뉴스');
  writeFileSync(`${root}/carousel/episodes/${id}.caption.txt`, cap);
  console.log(id, ep.slides.length);
}
