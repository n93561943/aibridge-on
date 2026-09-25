# CLAUDE.md — AI Bridge:ON

AI Bridge 교육 모델(이해·활용·구현·창작)의 수업 자료를 운영하는 교육 사이트.
전체 명세는 `docs/SPEC.md`에 있다. 작업 전에 반드시 읽는다.

## 작업 규칙
- `docs/SPEC.md`의 **9. 개발 단계** 순서대로, 한 번에 한 Phase만 구현한다.
- Phase 시작 전 계획을 먼저 보여주고, 끝나면 완료 기준 체크 결과를 보고한다.
- `docs/SPEC.md` 11장 결정 기록(D1~D11)과 다르게 구현하지 않는다. 애매하면 구현 전에 질문한다.
- `[미정]` 항목은 하드코딩하지 말고 환경변수나 `site_settings`로 분리한다.
- UI 문구·주석·커밋 메시지는 한국어, 코드 식별자는 영어.

## 기술 스택
Next.js 15 (App Router, TypeScript) · Tailwind + shadcn/ui · BlockNote · Supabase(Postgres/Auth/Storage) · Claude API · Vitest · Playwright

## 명령어
- `npm run dev` — 개발 서버
- `npm run lint` / `npm run typecheck` / `npm test` — 커밋 전 모두 통과해야 함
- `npx playwright test` — E2E
- `npx supabase migration new <name>` — DB 변경은 항상 마이그레이션 파일로

## 필수 원칙
- 모든 테이블에 RLS를 켠다. 권한은 UI + 서버 + RLS 세 곳에서 검사한다.
- `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`는 서버 코드에서만 사용한다. `.env*`는 커밋하지 않는다.
- 사용자 입력 HTML을 그대로 렌더링하지 않는다(`dangerouslySetInnerHTML` 금지).
- 모든 화면은 모바일(390px)에서 깨지지 않아야 한다.
- 만 14세 미만 회원과 보호자 동의 관련 코드는 개인정보 처리 로직이므로 변경 시 반드시 테스트를 함께 작성한다.
- Claude API 호출은 `lib/ai/`에서만 하고, 호출 전 권한(teacher 이상)·월 예산·일일 한도 검사를 거친다.
- AI 응답은 도구 사용 강제(tool_choice) + zod 검증으로만 받는다. 자유 텍스트 파싱 금지.
- 도메인은 `NEXT_PUBLIC_SITE_URL`로만 참조한다(aibridgeon.com 하드코딩 금지).

## 폴더 구조
```
app/            라우트 (app/(site), app/admin, app/api)
components/     공용 UI (components/editor = BlockNote 관련)
lib/            supabase 클라이언트, 권한 헬퍼, ai
supabase/       migrations, seed.sql
docs/SPEC.md    명세서
```
