// Created: 2026-07-12 03:45:48
import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  locale: 'ko-KR',
});
const page = await ctx.newPage();

const captured = [];
page.on('response', async (resp) => {
  const url = resp.url();
  if (/datalab\.naver\.com/.test(url) && !/\.(css|js|png|jpg|gif|woff|svg|ico)/.test(url)) {
    let body = '';
    try { body = await resp.text(); } catch (e) { return; }
    if (/온열|ratio|periodRatio|"data"/.test(body)) {
      captured.push({ url, method: resp.request().method(), status: resp.status(), body });
    }
  }
});

await page.goto('https://datalab.naver.com/keyword/trendSearch.naver', { waitUntil: 'networkidle', timeout: 30000 });

const groups = [
  ['온열질환', '온열질환,열사병,열탈진,일사병'],
  ['대상포진', '대상포진'],
  ['무릎관절', '무릎관절염,무릎통증'],
  ['냉방병', '냉방병'],
  ['폭염', '폭염,폭염특보,폭염경보'],
];
for (let i = 0; i < groups.length; i++) {
  await page.fill('#item_keyword' + (i + 1), groups[i][0]);
  await page.fill('#item_sub_keyword' + (i + 1) + '_1', groups[i][1]);
}

// 기간: 1년 라디오 라벨 클릭 시도 (라벨 텍스트에 '1년')
const periodClicked = await page.evaluate(() => {
  const labels = [...document.querySelectorAll('label')];
  const y = labels.find(l => /1년/.test(l.textContent));
  if (y) { y.click(); return y.textContent.trim(); }
  return null;
});

// 조회 버튼 찾기
const btnInfo = await page.evaluate(() => {
  const cand = [...document.querySelectorAll('a, button')].find(e => /조회/.test(e.textContent) && !/삭제/.test(e.textContent));
  if (cand) { return { txt: cand.textContent.trim(), tag: cand.tagName, cls: cand.className }; }
  return null;
});
console.log('PERIOD:', periodClicked, 'BTN:', JSON.stringify(btnInfo));

if (btnInfo) {
  await page.evaluate(() => {
    const cand = [...document.querySelectorAll('a, button')].find(e => /조회/.test(e.textContent) && !/삭제/.test(e.textContent));
    cand.click();
  });
}
await page.waitForTimeout(7000);
try { await page.waitForLoadState('networkidle', { timeout: 8000 }); } catch (e) {}

const result = await page.evaluate(() => {
  const out = { href: location.href };
  const gd = document.getElementById('graphData');
  out.graphDataRaw = gd ? gd.value.slice(0, 200) : null;
  // window 전역에서 시리즈 데이터 탐색
  const found = {};
  for (const k of Object.keys(window)) {
    try {
      const v = window[k];
      if (v && typeof v === 'object' && !Array.isArray(v)) {
        const s = JSON.stringify(v);
        if (s && s.length < 20000 && /period|ratio|"data"/.test(s) && /온열|대상|무릎|냉방|폭염/.test(s)) {
          found[k] = s.slice(0, 3000);
        }
      }
    } catch (e) {}
  }
  out.globals = found;
  // 범례
  out.legend = [...document.querySelectorAll('.graph_legend li, .legend li, li.legend_item')].map(e => e.textContent.trim()).slice(0, 8);
  return out;
});
console.log('HREF:', result.href);
console.log('GRAPHDATA_RAW:', result.graphDataRaw);
console.log('LEGEND:', JSON.stringify(result.legend));
console.log('GLOBAL_KEYS:', Object.keys(result.globals));
for (const k of Object.keys(result.globals)) console.log('---', k, ':', result.globals[k]);

// graphData 전체 파싱해서 그룹별 평균/최대 계산
const parsed = await page.evaluate(() => {
  const gd = document.getElementById('graphData');
  if (!gd || !gd.value) return null;
  try {
    const data = JSON.parse(gd.value);
    return data;
  } catch (e) { return { parseErr: e.message, raw: gd.value.slice(0, 500) }; }
});
console.log('PARSED_GRAPHDATA:', JSON.stringify(parsed).slice(0, 3000));

// 캡처된 응답에서 데이터 배열 추출
console.log('=== CAPTURED', captured.length);
for (const c of captured) {
  console.log('--- URL', c.url, c.method, c.status, 'len', c.body.length);
}
// 결과 HTML에서 데이터 패턴 탐색
const html = await page.content();
const m = html.match(/var\s+(graphData|resultData|periodList|nfData)\s*=\s*(\[.*?\]|\{.*?\})\s*;/s);
console.log('HTML_VAR_MATCH:', m ? (m[1] + ' => ' + m[2].slice(0, 1500)) : 'none');
// 결과 페이지에 그래프 데이터를 담은 element 텍스트
const dataAttr = await page.evaluate(() => {
  const el = document.querySelector('[data-json], .trend_result, #content');
  const svgTexts = [...document.querySelectorAll('text')].map(t => t.textContent).filter(t => /\d/.test(t)).slice(0, 40);
  return { svgTexts };
});
console.log('SVG_TEXTS:', JSON.stringify(dataAttr.svgTexts));

// 가장 큰 캡처 바디를 파일로 저장
if (captured.length) {
  const biggest = captured.sort((a, b) => b.body.length - a.body.length)[0];
  const fs = await import('fs');
  fs.writeFileSync('datalab-body.txt', biggest.body);
  console.log('SAVED biggest body from', biggest.url);
}
await browser.close();
