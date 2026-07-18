// Created: 2026-07-18 07:27:53
// 네이버 데이터랩 검색어트렌드 스크래퍼
// 2026-07-17 재작성: graphData(hidden input)가 빈 값으로 바뀌어 기존 방식 실패
//   → SVG path 좌표 + y축 눈금으로 값을 역산하는 방식으로 교체
//   (구버전은 naver-datalab.legacy.mjs 로 보관)
//
// 사용법:
//   node scripts/research/naver-datalab.mjs "대상포진" "재산세" "온열질환"
//   node scripts/research/naver-datalab.mjs --period=3개월 "키워드1" "키워드2"
//   주제어당 하위키워드는 콤마로: "폭염,폭염경보,폭염특보"
//
// 출력: 주제어별 연평균/최고/최근30일 (데이터랩 특성상 최고점=100 정규화된 상대값)

import { chromium } from 'playwright';

const argv = process.argv.slice(2);
const periodArg = (argv.find(a => a.startsWith('--period=')) || '--period=1년').split('=')[1];
const kws = argv.filter(a => !a.startsWith('--'));

if (kws.length === 0) {
  console.error('사용법: node scripts/research/naver-datalab.mjs "키워드1" "키워드2" ...');
  console.error('       주제어당 하위키워드는 콤마로 구분: "폭염,폭염경보,폭염특보"');
  process.exit(1);
}
if (kws.length > 5) console.error('※ 데이터랩 주제어는 최대 5개 — 앞의 5개만 사용합니다.');

const groups = kws.slice(0, 5).map(k => {
  const parts = k.split(',').map(s => s.trim()).filter(Boolean);
  return { title: parts[0], subs: parts.join(',') };
});

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({
  userAgent:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  locale: 'ko-KR',
});
const page = await ctx.newPage();

await page.goto('https://datalab.naver.com/keyword/trendSearch.naver', {
  waitUntil: 'networkidle',
  timeout: 45000,
});

for (let i = 0; i < groups.length; i++) {
  await page.fill('#item_keyword' + (i + 1), groups[i].title);
  await page.fill('#item_sub_keyword' + (i + 1) + '_1', groups[i].subs);
}

const periodOk = await page.evaluate((p) => {
  const l = [...document.querySelectorAll('label')].find(e => e.textContent.trim() === p);
  if (l) { l.click(); return true; }
  return false;
}, periodArg);

await page.evaluate(() => {
  const b = [...document.querySelectorAll('a,button')].find(
    e => /조회/.test(e.textContent) && !/삭제/.test(e.textContent));
  if (b) b.click();
});

await page.waitForTimeout(9000);
try { await page.waitForLoadState('networkidle', { timeout: 10000 }); } catch {}

const result = await page.evaluate(() => {
  const svg = document.querySelector('svg');
  if (!svg) return { err: 'SVG 없음 — 조회 실패 또는 페이지 구조 변경' };

  // 1) y축 눈금(순수 숫자 라벨) → 화면 y좌표. 날짜는 점(.)이 있어 자동 제외됨
  const ticks = [];
  for (const t of svg.querySelectorAll('text')) {
    const s = (t.textContent || '').trim();
    if (!/^\d+$/.test(s)) continue;
    const r = t.getBoundingClientRect();
    if (r.height === 0) continue;
    ticks.push({ v: parseInt(s, 10), y: r.top + r.height / 2 });
  }
  if (ticks.length < 2) return { err: 'y축 눈금을 찾지 못함 (구조 변경 가능성)' };
  ticks.sort((a, b) => a.v - b.v);
  const lo = ticks[0], hi = ticks[ticks.length - 1];
  if (lo.y === hi.y) return { err: 'y축 눈금 좌표 이상' };
  const toVal = (screenY) => lo.v + ((lo.y - screenY) * (hi.v - lo.v)) / (lo.y - hi.y);

  const dateLabels = [...svg.querySelectorAll('text')]
    .map(t => (t.textContent || '').trim())
    .filter(s => /\d+\./.test(s));

  // 2) path 좌표 → 값
  const paths = [...svg.querySelectorAll('path')].filter(p => (p.getAttribute('d') || '').length > 40);
  const series = paths.map((p) => {
    const ctm = p.getScreenCTM();
    const pts = [];
    const re = /([\d.]+),([\d.]+)/g;
    let m;
    while ((m = re.exec(p.getAttribute('d'))) !== null) {
      const local = svg.createSVGPoint();
      local.x = parseFloat(m[1]);
      local.y = parseFloat(m[2]);
      const scr = local.matrixTransform(ctm);
      pts.push(Math.max(0, Math.round(toVal(scr.y) * 10) / 10));
    }
    return { stroke: p.getAttribute('stroke') || getComputedStyle(p).stroke, values: pts };
  });

  const legend = [...document.querySelectorAll('label.info, .legend .value, span.value')]
    .map(e => e.textContent.trim()).filter(Boolean);

  return { series, legend: [...new Set(legend)], dateLabels };
});

if (result.err) {
  console.error('❌', result.err);
  await browser.close();
  process.exit(2);
}
if (!result.series.length) {
  console.error('❌ 그래프 데이터를 찾지 못했습니다. 키워드에 결과가 없거나 구조가 변경됐을 수 있습니다.');
  await browser.close();
  process.exit(2);
}

console.log(`\n=== 네이버 데이터랩 검색어트렌드 (${periodOk ? periodArg : '기본기간'}, 최고점=100 정규화) ===`);
if (result.dateLabels.length)
  console.log(`기간: ${result.dateLabels[0]} ~ ${result.dateLabels[result.dateLabels.length - 1]}`);

const rows = result.series.map((s, i) => {
  const v = s.values;
  const avg = v.reduce((a, b) => a + b, 0) / (v.length || 1);
  const max = Math.max(...v);
  const maxIdx = v.indexOf(max);
  const last30 = v.slice(-30);
  const recent = last30.reduce((a, b) => a + b, 0) / (last30.length || 1);
  return {
    주제어: groups[i] ? groups[i].title : `series${i + 1}`,
    연평균: +avg.toFixed(1),
    최고: +max.toFixed(0),
    '최고시점': ((maxIdx / (v.length - 1)) * 100).toFixed(0) + '% 지점',
    최근30일: +recent.toFixed(1),
    포인트: v.length,
  };
});
rows.sort((a, b) => b.연평균 - a.연평균);
console.table(rows);
console.log('※ 그래프 좌표에서 역산한 근사치입니다. 데이터랩 자체가 상대값이라 "비교 판단"에는 충분합니다.');
console.log('※ 주제어 순서 = 입력 순서. 범례:', result.legend.join(' / ') || '(확인 실패)');

await browser.close();
