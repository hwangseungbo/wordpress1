// Created: 2026-07-18 08:45:56
// 네이버 검색광고 API — 월간 검색량 절대값 조회 (PC / 모바일 분리)
// 2026-07-17 신규
//
// ⭐ 데이터랩·구글트렌드는 '상대값'이지만 이건 실제 검색 횟수(절대값)입니다.
//    + 경쟁정도(compIdx), 월평균 클릭수/클릭률까지 나옵니다.
//
// 인증정보는 .env 에 보관(gitignore됨). 절대 코드에 하드코딩하지 말 것:
//   NAVER_AD_CUSTOMER_ID / NAVER_AD_ACCESS_LICENSE / NAVER_AD_SECRET_KEY
//
// 사용법:
//   node scripts/research/naver-searchad.mjs 재산세 근로장려금 온열질환
//   node scripts/research/naver-searchad.mjs --related 재산세     (연관키워드까지 전부)
//   node scripts/research/naver-searchad.mjs --min=1000 --related 전기요금
//
// 옵션: --related  힌트키워드의 연관키워드 목록까지 출력(기본은 입력 키워드만)
//       --min=N    월간 총검색량 N 미만 제외 (기본 0)
//       --top=N    출력 개수 제한 (기본 30)

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

// ---- .env 로드 (의존성 없이) ----
const envPath = path.resolve(process.cwd(), '.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

const CUSTOMER_ID = process.env.NAVER_AD_CUSTOMER_ID;
const ACCESS_LICENSE = process.env.NAVER_AD_ACCESS_LICENSE;
const SECRET_KEY = process.env.NAVER_AD_SECRET_KEY;

if (!CUSTOMER_ID || !ACCESS_LICENSE || !SECRET_KEY) {
  console.error('❌ .env 에 NAVER_AD_CUSTOMER_ID / NAVER_AD_ACCESS_LICENSE / NAVER_AD_SECRET_KEY 가 필요합니다.');
  process.exit(1);
}

const argv = process.argv.slice(2);
const WITH_RELATED = argv.includes('--related');
const MIN = parseInt((argv.find(a => a.startsWith('--min=')) || '--min=0').split('=')[1], 10);
const TOP = parseInt((argv.find(a => a.startsWith('--top=')) || '--top=30').split('=')[1], 10);
const keywords = argv.filter(a => !a.startsWith('--'));

if (!keywords.length) {
  console.error('사용법: node scripts/research/naver-searchad.mjs 재산세 근로장려금 ...');
  console.error('옵션: --related (연관키워드 포함) --min=1000 --top=30');
  process.exit(1);
}
if (keywords.length > 5) console.error('※ hintKeywords는 최대 5개 — 앞의 5개만 사용합니다.');

const BASE = 'https://api.naver.com';
const PATH = '/keywordstool';

function signature(ts, method, uri) {
  return crypto.createHmac('sha256', SECRET_KEY).update(`${ts}.${method}.${uri}`).digest('base64');
}

// 네이버는 검색량이 10 미만이면 "< 10" 문자열로 반환
const num = (v) => {
  if (typeof v === 'number') return v;
  if (typeof v === 'string') {
    if (v.includes('<')) return 5; // "< 10" → 근사치 5
    const n = parseInt(v.replace(/[^0-9]/g, ''), 10);
    return isNaN(n) ? 0 : n;
  }
  return 0;
};
const COMP = { '높음': '높음', '중간': '중간', '낮음': '낮음' };

async function fetchKeywords(hints) {
  const ts = Date.now().toString();
  const uri = `${PATH}?hintKeywords=${encodeURIComponent(hints.join(','))}&showDetail=1`;
  const res = await fetch(BASE + uri, {
    headers: {
      'X-Timestamp': ts,
      'X-API-KEY': ACCESS_LICENSE,
      'X-Customer': String(CUSTOMER_ID),
      'X-Signature': signature(ts, 'GET', PATH), // 서명은 쿼리스트링 제외한 path 기준
      'Content-Type': 'application/json; charset=UTF-8',
    },
  });
  const txt = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status} — ${txt.slice(0, 200)}`);
  return JSON.parse(txt);
}

let data;
try {
  data = await fetchKeywords(keywords.slice(0, 5));
} catch (e) {
  console.error('❌ API 호출 실패:', e.message);
  console.error('   인증정보(고객ID·액세스라이선스·비밀키)와 IP 허용 설정을 확인하세요.');
  process.exit(2);
}

const list = data.keywordList || [];
if (!list.length) {
  console.error('결과 없음');
  process.exit(0);
}

const wanted = new Set(keywords.map(k => k.replace(/\s/g, '').toUpperCase()));
let rows = list.map(k => {
  const pc = num(k.monthlyPcQcCnt);
  const mo = num(k.monthlyMobileQcCnt);
  return {
    키워드: k.relKeyword,
    PC: pc,
    모바일: mo,
    합계: pc + mo,
    '모바일%': pc + mo > 0 ? Math.round((mo / (pc + mo)) * 100) + '%' : '-',
    경쟁도: COMP[k.compIdx] || k.compIdx || '-',
    월평균클릭_PC: num(k.monthlyAvePcClkCnt),
    월평균클릭_모바일: num(k.monthlyAveMobileClkCnt),
  };
});

if (!WITH_RELATED) rows = rows.filter(r => wanted.has(r.키워드.replace(/\s/g, '').toUpperCase()));
if (MIN > 0) rows = rows.filter(r => r.합계 >= MIN);
rows.sort((a, b) => b.합계 - a.합계);

console.log(`\n=== 네이버 검색광고 월간 검색량 (절대값, 최근 30일) ===`);
console.log(`조회: ${keywords.join(', ')}${WITH_RELATED ? ' (+연관키워드)' : ''}${MIN ? ` / ${MIN}회 이상만` : ''}`);
console.table(rows.slice(0, TOP));
if (rows.length > TOP) console.log(`※ ${rows.length}개 중 상위 ${TOP}개만 표시 (--top=N 으로 조정)`);
console.log('※ 네이버는 10회 미만을 "< 10"으로 주며, 위 표에서는 5로 근사 처리했습니다.');
console.log('※ 경쟁도는 광고 경쟁이며 SEO 난이도와는 다릅니다(참고용).');
