// Created: 2026-07-18 08:23:05
// 구글 트렌드 조회 (내부 API 직접 호출)
// 2026-07-17 신규
//
// 사용법:
//   node scripts/research/google-trends.mjs "재산세" "종합소득세"
//   node scripts/research/google-trends.mjs --time="today 3-m" "온열질환"
//   node scripts/research/google-trends.mjs --rising "전기요금"     (연관·급상승 검색어만)
//
// 옵션: --time=  today 12-m(기본) | today 3-m | today 1-m | now 7-d
//       --geo=   KR(기본)
//
// 출력: 키워드별 관심도(평균/최고/최근) + 연관/급상승 검색어

const argv = process.argv.slice(2);
const opt = (name, def) => {
  const a = argv.find((x) => x.startsWith(`--${name}=`));
  return a ? a.split('=').slice(1).join('=') : def;
};
const TIME = opt('time', 'today 12-m');
const GEO = opt('geo', 'KR');
const RISING_ONLY = argv.includes('--rising');
const kws = argv.filter((a) => !a.startsWith('--'));

if (!kws.length) {
  console.error('사용법: node scripts/research/google-trends.mjs "키워드1" "키워드2" ...');
  console.error('옵션: --time="today 3-m" --geo=KR --rising');
  process.exit(1);
}
if (kws.length > 5) console.error('※ 구글 트렌드는 최대 5개 비교 — 앞의 5개만 사용합니다.');
const terms = kws.slice(0, 5);

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

// 구글 트렌드 응답은 앞에 )]}', 같은 프리픽스가 붙음
const stripPrefix = (t) => {
  const i = t.indexOf('{');
  return i >= 0 ? t.slice(i) : t;
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 429(요청 과다) 시 간격을 늘려 재시도
async function getJson(url, cookie, tries = 4) {
  let wait = 1500;
  for (let attempt = 1; attempt <= tries; attempt++) {
    const res = await fetch(url, {
      headers: {
        'User-Agent': UA,
        'Accept-Language': 'ko-KR,ko;q=0.9',
        ...(cookie ? { cookie } : {}),
      },
    });
    const txt = await res.text();
    if (res.ok) return JSON.parse(stripPrefix(txt));
    if (res.status === 429 && attempt < tries) {
      await sleep(wait);
      wait *= 2; // 1.5s → 3s → 6s
      continue;
    }
    throw new Error(`HTTP ${res.status} — ${txt.slice(0, 100)}`);
  }
}

// 쿠키 확보(일부 지역에서 필요)
let cookie = '';
try {
  const r = await fetch('https://trends.google.com/trends/?geo=' + GEO, { headers: { 'User-Agent': UA } });
  const sc = r.headers.get('set-cookie');
  if (sc) cookie = sc.split(';')[0];
} catch {}

// 1) explore → 위젯 토큰
const comparisonItem = terms.map((t) => ({ keyword: t, geo: GEO, time: TIME }));
const exploreReq = encodeURIComponent(JSON.stringify({ comparisonItem, category: 0, property: '' }));
const exploreUrl =
  `https://trends.google.com/trends/api/explore?hl=ko&tz=-540&req=${exploreReq}&tz=-540`;

let widgets;
try {
  const j = await getJson(exploreUrl, cookie);
  widgets = j.widgets;
} catch (e) {
  console.error('❌ explore 실패:', e.message);
  console.error('   (구글이 자동 요청을 차단했을 수 있습니다. 잠시 후 재시도하거나 --rising 없이 시도하세요.)');
  process.exit(2);
}

const wTimeline = widgets.find((w) => w.id === 'TIMESERIES');
const wRelated = widgets.filter((w) => String(w.id).startsWith('RELATED_QUERIES'));

// 2) 관심도 추이
if (!RISING_ONLY && wTimeline) {
  const url =
    `https://trends.google.com/trends/api/widgetdata/multiline?hl=ko&tz=-540` +
    `&req=${encodeURIComponent(JSON.stringify(wTimeline.request))}&token=${wTimeline.token}&tz=-540`;
  try {
    const j = await getJson(url, cookie);
    const rows = j.default.timelineData || [];
    console.log(`\n=== 구글 트렌드 관심도 (${TIME}, ${GEO}) ===`);
    const out = terms.map((t, i) => {
      const vals = rows.map((r) => (r.value ? r.value[i] : 0));
      const avg = vals.reduce((a, b) => a + b, 0) / (vals.length || 1);
      const max = Math.max(...vals);
      const maxIdx = vals.indexOf(max);
      const tail = vals.slice(-Math.max(1, Math.round(vals.length / 12)));
      const recent = tail.reduce((a, b) => a + b, 0) / tail.length;
      return {
        키워드: t,
        평균: +avg.toFixed(1),
        최고: max,
        최고시점: rows[maxIdx] ? rows[maxIdx].formattedTime : '-',
        최근: +recent.toFixed(1),
      };
    });
    out.sort((a, b) => b.평균 - a.평균);
    console.table(out);
  } catch (e) {
    console.error('⚠️ 관심도 조회 실패:', e.message);
  }
}

// 3) 연관·급상승 검색어
for (let i = 0; i < wRelated.length && i < terms.length; i++) {
  await sleep(1800); // 연속 호출 시 429 방지
  const w = wRelated[i];
  const url =
    `https://trends.google.com/trends/api/widgetdata/relatedsearches?hl=ko&tz=-540` +
    `&req=${encodeURIComponent(JSON.stringify(w.request))}&token=${w.token}&tz=-540`;
  try {
    const j = await getJson(url, cookie);
    const ranked = j.default.rankedList || [];
    const label = terms[i] || `키워드${i + 1}`;
    console.log(`\n--- [${label}] 연관 검색어 ---`);
    const top = (ranked[0] && ranked[0].rankedKeyword) || [];
    console.log('  인기: ' + (top.slice(0, 10).map((k) => `${k.query}(${k.value})`).join(' | ') || '없음'));
    const rising = (ranked[1] && ranked[1].rankedKeyword) || [];
    console.log('  급상승: ' + (rising.slice(0, 10).map((k) => `${k.query}(${k.formattedValue})`).join(' | ') || '없음'));
  } catch (e) {
    console.error(`⚠️ [${terms[i]}] 연관검색어 실패:`, e.message);
  }
}

console.log('\n※ 값은 기간 내 최고=100 상대치입니다(절대 검색량 아님).');
