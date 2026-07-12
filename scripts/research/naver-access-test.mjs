// Created: 2026-07-12 03:24:31
import { chromium } from 'playwright';

const urls = [
  'https://datalab.naver.com',
  'https://datalab.naver.com/keyword/trendSearch.naver',
  'https://search.naver.com/search.naver?query=온열질환',
];

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  locale: 'ko-KR',
});
const page = await ctx.newPage();

for (const url of urls) {
  try {
    const resp = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
    const title = await page.title();
    console.log(JSON.stringify({ url, status: resp?.status(), title: title.slice(0, 60) }));
  } catch (e) {
    console.log(JSON.stringify({ url, error: e.message.split('\n')[0] }));
  }
}

// DataLab 자동완성/검색어 API 직접 호출 테스트 (연령 데이터 가능성 탐색)
try {
  const acRes = await page.evaluate(async () => {
    const r = await fetch('https://ac.search.naver.com/nx/ac?q=' + encodeURIComponent('온열질환') + '&con=0&frm=nv&ans=2&r_format=json&st=100', { credentials: 'omit' });
    const t = await r.text();
    return { status: r.status, head: t.slice(0, 300) };
  });
  console.log('AC_API:', JSON.stringify(acRes));
} catch (e) {
  console.log('AC_API_ERR:', e.message.split('\n')[0]);
}

await browser.close();
