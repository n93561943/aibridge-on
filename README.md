# AI Bridge:ON

이해에서 창작까지, AI 교육을 켜다 — AI Bridge 교육 모델(이해·활용·구현·창작)의 차시별 수업 자료를 운영하는 교육 사이트.

- 전체 명세: [`docs/SPEC.md`](docs/SPEC.md)
- 작업 규칙: [`CLAUDE.md`](CLAUDE.md)

## 기술 스택

Next.js 15 (App Router, TypeScript) · Tailwind CSS 4 + shadcn/ui · Pretendard · Supabase(Postgres/Auth/Storage) · Claude API · Vitest · Playwright

## 시작하기

```bash
npm install
cp .env.example .env.local   # 값 채우기 (아래 "환경변수" 참고)
npm run dev                  # http://localhost:3000
```

Supabase 키가 없어도 사이트는 뜬다(빈 사이트). 연결 상태는 `/api/health`에서 확인한다.

| `/api/health` 응답의 `supabase` | 의미                                                 |
| ------------------------------- | ---------------------------------------------------- |
| `not_configured`                | Supabase 환경변수가 비어 있음                        |
| `ok`                            | Supabase Auth 서버 응답 정상                         |
| `error`                         | 주소·키가 틀렸거나 접속 불가(방화벽 확인) — HTTP 503 |

## 명령어

| 명령                          | 설명                                      |
| ----------------------------- | ----------------------------------------- |
| `npm run dev`                 | 개발 서버                                 |
| `npm run build` / `npm start` | 운영 빌드 / 실행                          |
| `npm run lint`                | ESLint                                    |
| `npm run typecheck`           | TypeScript 검사                           |
| `npm test`                    | Vitest 단위 테스트                        |
| `npm run test:e2e`            | Playwright E2E (빌드 후 서버를 띄워 실행) |
| `npm run format`              | Prettier 정리                             |

커밋 전에 `lint`, `typecheck`, `test`가 모두 통과해야 한다.

### E2E 테스트 준비

```bash
npx playwright install chromium
sudo npx playwright install-deps chromium   # 브라우저 실행용 시스템 라이브러리 (최초 1회)
```

> 개발 컨테이너(`.devcontainer`)는 sudo가 막혀 있어 `install-deps`를 할 수 없다.
> 컨테이너에서 E2E를 돌리려면 Dockerfile에 `RUN npx -y playwright@<버전> install-deps chromium`(root 단계)을 추가하고 재빌드하거나, 호스트에서 실행한다.
> 이미 떠 있는 서버를 대상으로 하려면 `PLAYWRIGHT_BASE_URL=http://localhost:3000 npm run test:e2e`.

## 환경변수

`.env.example` 참고. `.env*` 파일은 커밋하지 않는다(`.env.example`만 예외).

| 변수                                                        | 공개      | 설명                                                    |
| ----------------------------------------------------------- | --------- | ------------------------------------------------------- |
| `NEXT_PUBLIC_SITE_URL`                                      | O         | 사이트 주소. 도메인은 코드에 쓰지 않고 이 값으로만 참조 |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | O         | Supabase 프로젝트 URL·anon 키                           |
| `SUPABASE_SERVICE_ROLE_KEY`                                 | 서버 전용 | RLS 우회 키. `lib/supabase/admin.ts`에서만 사용         |
| `RESEND_API_KEY`, `MAIL_FROM`                               | 서버 전용 | 메일 발송(P1부터)                                       |
| `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`, `AI_PRICE_*`        | 서버 전용 | AI 토론 주제 생성(P7)                                   |
| `ADMIN_EMAILS`                                              | 서버 전용 | 최초 관리자 이메일(쉼표 구분, P1부터)                   |

서버 전용 값은 `lib/env.server.ts`(`import "server-only"`)를 통해서만 읽는다. 클라이언트 컴포넌트에서 가져오면 빌드가 실패한다.

## Supabase 연결

1. [supabase.com](https://supabase.com)에서 프로젝트 생성 (리전: Northeast Asia (Seoul) 권장)
2. **개발 컨테이너 방화벽 등록** — `cp .devcontainer/allowed-domains.example.txt .devcontainer/allowed-domains.txt` 후 복사본에서 (복사본은 git 무시됨)
   - `YOUR-PROJECT-REF.supabase.co` → 대시보드 **Project Settings → API → Project URL**의 호스트
   - `YOUR-POOLER-HOST.pooler.supabase.com` → 대시보드 **Connect → Session pooler**의 host
   - 수정 후 **컨테이너 재빌드**(명령 팔레트 → "Dev Containers: Rebuild Container")
3. `.env.local`에 `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` 입력
4. `npm run dev` 후 `http://localhost:3000/api/health`에서 `"supabase":"ok"` 확인
5. CLI 연결(마이그레이션용, P1부터)
   ```bash
   npx supabase login
   npx supabase link --project-ref <project-ref>
   npx supabase migration new <name>   # DB 변경은 항상 마이그레이션 파일로
   npx supabase db push
   ```

> 이메일 OTP 코드 로그인용 메일 템플릿·Resend SMTP 설정은 P1에서 이 문서에 추가한다.

## 배포 (GitHub → Vercel)

1. GitHub 저장소에 push
2. [vercel.com](https://vercel.com) → **Add New… → Project** → 저장소 Import (Framework: Next.js, 설정 기본값)
3. **Settings → Environment Variables**에 `.env.example`의 변수 입력
   - `NEXT_PUBLIC_SITE_URL`: 도메인 연결 전에는 Vercel 기본 주소(`https://<프로젝트>.vercel.app`). **Production 환경에서 비어 있으면 빌드가 실패한다.** Preview 환경은 비워 두면 배포별 주소(`NEXT_PUBLIC_VERCEL_URL`)를 쓴다(Vercel 설정의 "Automatically expose System Environment Variables"가 켜져 있어야 함)
   - Supabase 프로젝트가 없으면 Supabase 값은 비워 둬도 배포된다
4. Deploy → 이후 `main`에 push할 때마다 자동 배포, PR마다 미리보기 배포
5. 배포 주소의 `/api/health` 확인

도메인(aibridgeon.com) 연결은 [`docs/SPEC.md` 2.2 체크리스트](docs/SPEC.md)를 따른다.

## 폴더 구조

```
app/
  (site)/          공개 사이트 (헤더·푸터 레이아웃)
  api/health/      연결 상태 확인
components/
  layout/          헤더·푸터·로고·모바일 메뉴
  ui/              shadcn/ui
lib/
  env.ts           공개 환경변수 (zod 검증)
  env.server.ts    서버 전용 환경변수
  site.ts          사이트명·부제·AI Bridge 4단계
  supabase/        client(브라우저) / server(쿠키 세션) / admin(service role) / middleware
supabase/          config.toml, migrations, seed.sql
types/database.ts  Supabase 타입 (P1부터 `supabase gen types`로 생성)
e2e/               Playwright 테스트
```

## 디자인 토큰

`app/globals.css`에 정의. 로고 시안 확정 전 임시값이며, 확정 시 `:root`/`.dark`의 브랜드·단계 색상 블록만 바꾼다.

- `--brand` → `text-brand`, `bg-brand`
- 단계 색상 `--stage-literacy`(이해) / `--stage-usage`(활용) / `--stage-coding`(구현) / `--stage-project`(창작) → `bg-stage-coding text-stage-coding-foreground` 등
- 콘텐츠 폭 `container-site` 유틸리티(모바일 좌우 여백 16px)
- 로고는 `components/layout/logo.tsx` 한 곳에서 교체
