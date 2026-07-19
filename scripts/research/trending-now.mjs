// Created: 2026-07-19 09:04:57
// 구글 트렌드 "지금 뜨는 검색어" (Trending Now) — 실시간 급상승 소재 발굴
// 2026-07-19 신규
//
// ⭐ 기존 도구와의 차이:
//   - naver-searchad.mjs : 월간 검색량 절대값 (이미 뜬 키워드, 후행지표)
//   - naver-datalab.mjs  : 상대 추이 (씨앗 키워드가 있어야 함)
//   - google-trends.mjs --rising : 씨앗 키워드의 연관 급상승
//   - ⭐ 이 스크립트 : 씨앗 없이 "지금 전체에서 튀어오르는 것"을 통째로 가져옴
//
// 사용법:
//   node scripts/research/trending-now.mjs
//   node scripts/research/trending-now.mjs --geo=KR --limit=30
//   node scripts/research/trending-now.mjs --json          (원본 JSON 출력)
//
// ⚠️ 실시간 트렌드는 대부분 연예·스포츠·사건사고다. 우리 기준(정보성·중장년·
//    애드센스 안전)에 맞는 건 소수이므로, 아래 분류 힌트를 참고해 직접 고를 것.
//    특히 사건사고·인물 관련은 명예훼손·민감이슈 위험이 있어 대부분 부적합.

const argv = process.argv.slice(2);
const GEO = (argv.find((a) => a.startsWith('--geo=')) || '--geo=KR').split('=')[1];
const LIMIT = parseInt((argv.find((a) => a.startsWith('--limit=')) || '--limit=25').split('=')[1], 10);
const AS_JSON = argv.includes('--json');

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

const dec = (s) =>
  (s || '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .trim();

const pick = (block, tag) => {
  const m = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`));
  return m ? dec(m[1]) : '';
};

// 대략적 분류 — 우리 기준에 맞는 소재를 빠르게 걸러내기 위한 힌트
const BUCKETS = [
  { tag: '스포츠', re: /경기|승부|감독|선수|리그|야구|축구|농구|배구|골프|올림픽|월드컵|KBO|prem/i },
  { tag: '연예', re: /배우|가수|아이돌|드라마|영화|앨범|콘서트|열애|결혼|이혼|출연|예능|아나운서/i },
  { tag: '사건사고', re: /사망|숨진|사고|화재|체포|구속|피의자|수사|재판|선고|논란|의혹|폭행|사기/i },
  { tag: '정치', re: /대통령|의원|장관|국회|당대표|선거|여야|정당|청문회/i },
  { tag: '날씨·재난', re: /태풍|폭염|한파|지진|호우|장마|미세먼지|산불|대설|경보/i },
  { tag: '⭐생활·정책', re: /지원금|신청|환급|급여|보험|세금|요금|공휴일|접수|모집|인상|시행|개정|보조금|청약|대출|연말정산|건강보험|과태료|면허|등본|증명서/i },
  { tag: '⭐금융·재테크', re: /예금|적금|저축|금리|특판|이자|연금|퇴직|물가|환율|공시가|시세|부동산|전세|월세/i },
  { tag: '⭐건강', re: /증상|예방|백신|접종|질환|감염|유행|바이러스|독감|식중독|치료|검진|건강|영양|다이어트/i },
];
const classify = (t) => {
  for (const b of BUCKETS) if (b.re.test(t)) return b.tag;
  return '기타';
};

async function fetchRss(geo) {
  const url = `https://trends.google.com/trending/rss?geo=${encodeURIComponent(geo)}`;
  const res = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'ko-KR,ko;q=0.9' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const xml = await res.text();
  const items = xml.split('<item>').slice(1).map((chunk) => {
    const block = chunk.split('</item>')[0];
    const news = [...block.matchAll(/<ht:news_item>([\s\S]*?)<\/ht:news_item>/g)].map((m) => ({
      title: pick(m[1], 'ht:news_item_title'),
      url: pick(m[1], 'ht:news_item_url'),
      source: pick(m[1], 'ht:news_item_source'),
    }));
    const title = pick(block, 'title');
    return {
      키워드: title,
      추정검색량: pick(block, 'ht:approx_traffic') || '-',
      분류: classify(title + ' ' + news.map((n) => n.title).join(' ')),
      기사: news.slice(0, 2),
    };
  });
  if (!items.length) throw new Error('항목 없음 (피드 구조 변경 가능성)');
  return items;
}

let items;
try {
  items = await fetchRss(GEO);
} catch (e) {
  console.error(`❌ 실시간 트렌드 조회 실패: ${e.message}`);
  console.error('   구글이 자동 요청을 차단했거나 피드 구조가 바뀌었을 수 있습니다.');
  console.error('   대안: insane-search 플러그인으로 trends.google.com/trending?geo=KR 접근');
  process.exit(2);
}

if (AS_JSON) {
  console.log(JSON.stringify(items.slice(0, LIMIT), null, 1));
  process.exit(0);
}

console.log(`\n=== 구글 트렌드 지금 뜨는 검색어 (${GEO}) ===`);
console.table(
  items.slice(0, LIMIT).map((it, i) => ({
    '#': i + 1,
    분류: it.분류,
    키워드: it.키워드,
    추정검색량: it.추정검색량,
    대표기사: (it.기사[0] && it.기사[0].title || '').slice(0, 42),
  }))
);

const good = items.slice(0, LIMIT).filter((i) => i.분류.startsWith('⭐'));
console.log(`\n⭐ 우리 기준(정보성) 후보 ${good.length}건:`);
if (good.length) {
  good.forEach((g) => {
    console.log(`  · ${g.키워드} (${g.추정검색량}) — ${g.분류}`);
    g.기사.forEach((a) => console.log(`      ${a.source}: ${a.title}`));
  });
} else {
  console.log('  없음 — 오늘은 연예·스포츠·사건 위주입니다. 무리해서 쓰지 말 것.');
}
console.log('\n※ 실시간 트렌드는 휘발성이 큽니다. 에버그린으로 전환 가능한 각도를 찾을 것');
console.log('※ 인물·사건사고는 명예훼손·민감이슈 위험 → 대부분 부적합');
