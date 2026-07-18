// Created: 2026-07-18 14:03:58
/* =========================================================
   이슈브리프 대표이미지(커버) 생성기  v2  (2026-07-18)

   ⚠️ 새 글을 발행할 때마다 이 커버를 만들어 대표이미지로 지정할 것.
      1200×630 = 카드 썸네일 + 카카오톡/페북 공유(OG) 이미지 겸용.
      (본문 안의 정사각 1080×1080 인포그래픽과는 별개다.
       정사각을 대표이미지로 쓰면 카드에서 16:9로 잘려 제목이 날아간다.)

   실행 방법: 워드프레스 관리자 페이지(wp-admin) 탭의 콘솔에 붙여넣고
             맨 아래 예시처럼 호출. wpApiSettings.nonce 가 있어야 한다.

   디자인 규칙 (사용자 확정): 카테고리를 크게, 제목은 작게.
     카드 아래에 제목이 또 나오므로 커버까지 제목을 크게 넣으면 중복된다.
   ========================================================= */

window.__makeCover = function (title, cat) {
  const W = 1200, H = 630;
  const RED = '#A31621', TINT = '#FAEDEE', INK = '#1A1517',
        BODY = '#56504F', MUT = '#8C8385', LINE = '#E7E1E1';

  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const x = c.getContext('2d');

  x.fillStyle = '#fff'; x.fillRect(0, 0, W, H);

  // 우측 워터마크 — 브리프 문서 3줄 모티프
  x.fillStyle = TINT;
  const wx = 790, wy = 150, bw = [150, 300, 300], bh = 44, gap = 30;
  bw.forEach((w, i) => { x.beginPath(); x.roundRect(wx, wy + i * (bh + gap), w, bh, 22); x.fill(); });

  x.fillStyle = RED; x.fillRect(0, 0, W, 12);
  const F = (w, s) => x.font = `${w} ${s}px Pretendard,"Malgun Gothic","Apple SD Gothic Neo",sans-serif`;
  const PAD = 80, maxW = 640;   // maxW: 워터마크와 겹치지 않는 폭

  // 붉은 단서 바
  x.fillStyle = RED;
  x.beginPath(); x.roundRect(PAD, 196, 60, 8, 4); x.fill();

  // 카테고리 — 주인공
  F(800, 68); x.fillStyle = INK;
  try { x.letterSpacing = '-1px'; } catch (e) {}
  x.fillText(cat, PAD, 300);
  try { x.letterSpacing = '0px'; } catch (e) {}

  // 제목 — 보조. 어절 단위 줄바꿈(글자 중간에서 끊기면 읽기 나쁨)
  function wrap() {
    const words = title.split(' '); const out = []; let cur = '';
    for (const w of words) {
      const t = cur ? cur + ' ' + w : w;
      if (x.measureText(t).width <= maxW) { cur = t; continue; }
      if (cur) { out.push(cur); cur = ''; }
      if (x.measureText(w).width <= maxW) { cur = w; continue; }
      let p = '';
      for (const ch of w) { if (x.measureText(p + ch).width > maxW && p) { out.push(p); p = ch; } else p += ch; }
      cur = p;
    }
    if (cur) out.push(cur);
    return out.map(s => s.trim());
  }
  let size = 30, lines = [];
  for (const s of [30, 27, 24]) { F(600, s); size = s; lines = wrap(); if (lines.length <= 3) break; }
  if (lines.length > 3) { lines = lines.slice(0, 3); lines[2] = lines[2].replace(/.$/, '…'); }
  F(600, size); x.fillStyle = BODY;
  let y = 364; const lh = size * 1.5;
  lines.forEach(l => { x.fillText(l, PAD, y); y += lh; });

  // 하단 구분선 + 브랜드
  x.strokeStyle = LINE; x.lineWidth = 1;
  x.beginPath(); x.moveTo(PAD, 516); x.lineTo(W - PAD, 516); x.stroke();

  const bx = PAD, by = 548, S = 44;
  x.fillStyle = RED;
  x.beginPath(); x.roundRect(bx, by, S, S, 10); x.fill();
  x.fillStyle = '#fff';
  x.beginPath(); x.roundRect(bx + 10, by + 12, 14, 4.5, 2.2); x.fill();
  x.beginPath(); x.roundRect(bx + 10, by + 20, 24, 4.5, 2.2); x.fill();
  x.beginPath(); x.roundRect(bx + 10, by + 28, 24, 4.5, 2.2); x.fill();
  F(800, 27); x.fillStyle = INK; x.fillText('이슈브리프', bx + S + 16, by + 31);

  F(500, 22); x.fillStyle = MUT;
  const d = 'issuebrief.net';
  x.fillText(d, W - PAD - x.measureText(d).width, by + 31);

  return c;
};

/* ── 업로드 + 대표이미지 지정 ─────────────────────────────
   postId  : 글 ID
   title   : 글 제목
   cat     : 카테고리명 (생활정보 / 경제·재테크 / IT·디지털 / 건강·라이프 / 이슈·트렌드)
   slug    : 파일명에 쓸 슬러그
   ⚠️ cafe24 Basic 과부하 방지 — 여러 건이면 700ms 간격으로 순차 실행할 것.
*/
window.__applyCover = async function (postId, title, cat, slug) {
  const N = wpApiSettings.nonce;
  const cv = window.__makeCover(title, cat);
  const blob = await new Promise(r => cv.toBlob(r, 'image/webp', 0.92));

  const fd = new FormData();
  fd.append('file', blob, `cover2-${slug}.webp`);
  fd.append('title', `${title} 커버`);
  fd.append('alt_text', `${cat} — ${title} | 이슈브리프`);

  const mr = await fetch('/wp-json/wp/v2/media', {
    method: 'POST', headers: { 'X-WP-Nonce': N }, body: fd
  });
  const mj = await mr.json();
  if (!mj.id) throw new Error('업로드 실패: ' + (mj.message || mr.status));

  const pr = await fetch(`/wp-json/wp/v2/posts/${postId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-WP-Nonce': N },
    body: JSON.stringify({ featured_media: mj.id })
  });
  const pj = await pr.json();
  return { postId, mediaId: mj.id, ok: pj.featured_media === mj.id, url: mj.source_url };
};

/* 미리보기(업로드 없이 화면에 그려서 확인) — 발행 전 눈으로 볼 것
   const cv = window.__makeCover('자동차세 연납 할인율 조회 계산 납부방법 총정리','경제·재테크');
   cv.style.width='480px'; document.body.prepend(cv);

   실제 적용
   await window.__applyCover(322, '자동차세 연납 할인율 조회 계산 납부방법 총정리', '경제·재테크', 'car-tax-guide');
*/
