<!-- Created: 2026-07-12 04:18:21 -->
# wordpress1 — WordPress × 구글 애드센스 블로그 자동화

여러 대의 PC·여러 워드프레스 계정에서 **정보성 블로그를 표준대로 운영·자동화**하기 위한 프로젝트. GitHub로 코드·표준을 공유하고, **계정 비밀정보는 각 PC 로컬에만** 둔다.

## 🔐 보안 (가장 중요)
- **비밀번호·Application Password·API 키는 절대 커밋 금지.** `.gitignore`가 `sites.config.json`, `.env`, `secrets/` 등을 제외한다.
- 실제 설정: `sites.config.example.json`을 복사해 **`sites.config.json`**(gitignore됨)으로 만들고 값 입력.
- 워드프레스 인증은 각 사이트의 **Application Password**(WP 관리자 > 사용자 > 프로필)를 사용 — 로그인 세션(브라우저 nonce)과 달리 헤드리스·다중 자동화에 적합.

## 📁 구조
```
wordpress1/
├─ README.md                       # 이 파일
├─ .gitignore                      # 비밀정보/산출물 제외
├─ sites.config.example.json       # 사이트 설정 템플릿(커밋 O)
├─ sites.config.json               # 실제 설정(커밋 X, 각 PC 로컬)
├─ issuebrief-작업지침서.md          # ⭐ 콘텐츠/SEO 표준·주제선정·인사이트 정본(로컬 사본)
├─ 워드프레스-정본-포인터.md          # WP 비공개 정본(글 147) 위치 안내
└─ scripts/
   └─ research/
      ├─ naver-datalab.mjs         # 네이버 데이터랩 검색량 조회(Playwright, 네이버 차단 우회)
      ├─ parse-datalab.mjs         # 데이터랩 결과 HTML → 그룹별 평균/최대 파싱
      └─ naver-access-test.mjs     # 네이버 접근 가능 여부 점검
```

## 📖 콘텐츠 표준
글쓰기·주제선정(5개 도구 데이터 기반)·이미지·QA 기준은 **`issuebrief-작업지침서.md`** 참고. 새 인사이트는 이 문서 + 워드프레스 정본(글 147) + 클로드 메모리 3곳에 갱신.

## ▶ 리서치 스크립트 실행
```bash
npm i playwright
npx playwright install chromium
node scripts/research/naver-datalab.mjs   # 후보 키워드 검색량 비교
```

## 🚧 다음 단계(자동화 로드맵)
- [ ] `sites.config.json` 기반 **WP REST 발행 모듈**(Application Password 인증)
- [ ] 이미지 생성(현재 브라우저 canvas → 헤드리스: node-canvas 또는 Playwright 렌더)
- [ ] 주제선정 → 초안 → 이미지 → 발행 → QA 파이프라인 스크립트
- [ ] 사이트별 배치 실행(여러 블로그 동시 운영)
