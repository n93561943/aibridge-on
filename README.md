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

**인증·RLS E2E(`e2e/auth.spec.ts`, `e2e/rls.spec.ts`)**

- `.env.local`의 Supabase 값(서버 전용 키 포함)으로 **개발용 원격 프로젝트**에 접속한다. 운영 프로젝트 키로 돌리지 않는다.
- 메일을 보내지 않는다. 관리자 API(`generateLink`)로 로그인 코드를 받아 세션 쿠키를 넣고, 보호자 동의 토큰도 테스트가 직접 만든다.
- `e2e+<랜덤>@example.com` 계정을 만들고 테스트가 끝나면 지운다. 중간에 끊기면 대시보드 Authentication → Users에서 `e2e+`로 검색해 지운다.
- `npm run dev`를 **두 개 동시에 띄우지 않는다.** `.next` 캐시를 같이 써서 Server Action을 찾지 못하는 오류(`UnrecognizedActionError`)가 날 수 있다. 이런 오류가 나면 개발 서버를 끄고 `.next`를 지운 뒤 다시 띄운다.

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
| `CRON_SECRET`                                               | 서버 전용 | Vercel Cron 인증(휴지통 자동 삭제, P3부터)              |

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

6. DB 변경 적용: `npx supabase db push` 후 `npx supabase gen types typescript --linked > types/database.ts`

## 인증(이메일 코드 로그인) 설정

로컬 `supabase/config.toml`에는 반영되어 있지만, **원격 프로젝트는 대시보드에서 직접 맞춰야 한다.**

### 1. Authentication → Sign In / Providers → Email

| 항목                  | 값                               |
| --------------------- | -------------------------------- |
| Enable Email provider | 켬                               |
| Confirm email         | 끔(코드 입력 자체가 이메일 확인) |
| Email OTP Expiration  | `600` (10분)                     |
| Email OTP Length      | `6`                              |

### 2. Authentication → Emails → Templates

**Magic Link**와 **Confirm signup** 두 템플릿의 제목을 `[AI Bridge:ON] 로그인 코드`로, 본문을 [`supabase/templates/otp-code.html`](supabase/templates/otp-code.html) 내용으로 바꾼다. 기본 템플릿은 링크를 보내므로, 바꾸지 않으면 코드가 아니라 링크가 간다.

### 3. Authentication → Rate Limits

- 이메일 발송 간격: 60초(화면의 재발송 카운트다운과 맞춤)
- 이메일 발송 한도: 기본 SMTP는 시간당 몇 통으로 고정. Resend 연결 후 늘린다.

### 4. Authentication → URL Configuration

- Site URL: 개발 중 `http://localhost:3000`, 운영 전환 시 `NEXT_PUBLIC_SITE_URL`과 같은 주소([`docs/SPEC.md` 2.2](docs/SPEC.md))

### 5. 메일 발송(Resend)

- **Supabase 기본 SMTP는 프로젝트 팀원 이메일로만, 시간당 소량만 보낸다.** 팀원이 아닌 이메일로 로그인을 시험하려면 Resend가 필요하다.
- 로그인 코드 메일: Authentication → Emails → SMTP Settings에서 Custom SMTP를 켜고 Host `smtp.resend.com`, Port `465`, User `resend`, Password = Resend API 키, 발신 주소 = `MAIL_FROM`의 주소.
- 보호자 동의 메일: 앱이 Resend API로 직접 보낸다(`RESEND_API_KEY`, `MAIL_FROM`).
  - 키가 없으면 **개발 환경에서만** 메일 내용(동의 링크 포함)을 `npm run dev` 터미널에 출력한다.
  - 운영 빌드에서 키가 없으면 발송 실패로 처리한다.
- Resend에서 도메인(aibridgeon.com) 인증 전에는 Resend 계정 본인 이메일로만 보낼 수 있다.

### 동작 규칙과 한계

- 코드 5회 오류 시 무효: 앱의 로그인 화면을 거칠 때 적용된다(`otp_attempts`). Supabase Auth API를 직접 호출하는 우회는 Supabase 자체의 검증 횟수 제한에 의존한다.
- 로그인 유지 30일: 마지막 코드 로그인부터 30일이 지나면 middleware가 세션을 서버에서 끝낸다(refresh token도 무효). Supabase 무료 등급에는 세션 최대 수명(Time-box) 설정이 없어 앱에서 처리한다. 세션 쿠키 수명도 30일이다.
- `ADMIN_EMAILS`의 이메일은 첫 로그인 후 가입 정보 입력(`/signup`)을 마치면 관리자로 만들어진다(SPEC F-01). 이미 가입한 계정을 관리자로 바꾸는 것은 관리자 화면(P6)에서 한다.
- 만 14세 미만 가입 후 7일 안에 보호자 동의가 없는 계정, 로그인만 하고 가입을 끝내지 않은 채 7일이 지난 계정은 `pg_cron` 작업(`purge-expired-accounts`, 매시간)이 삭제한다.

## 메뉴(P2)

- 헤더 메뉴는 `menus` 테이블에서 읽는다. 관리자는 헤더의 내 계정 메뉴 → **관리자**(`/admin/menus`)에서 추가·수정·숨기기·삭제·순서 변경을 한다. 바꾸면 헤더에 바로 반영된다(`menus` 캐시 태그 재검증).
- 시드 메뉴(SPEC 4장)는 마이그레이션 `p2_menus`에 들어 있어 `npx supabase db push` 때 함께 들어간다. 같은 slug가 이미 있으면 건너뛴다.
- **온라인 저지**는 주소가 정해지지 않아 비활성으로 시드된다. 주소가 정해지면 `/admin/menus`에서 수정 → 외부 주소 입력 → 보이기.
- 규칙: 최대 2단계, 하위 메뉴는 그룹 아래에만. 그룹은 첫 번째 보이는 하위 메뉴로 이동한다. 하위 메뉴가 있는 메뉴는 삭제할 수 없다. 게시물이 있는 메뉴 삭제 처리(옮기기·휴지통)는 P3에서 추가한다.
- slug는 영문 소문자·숫자·하이픈만 쓴다. 기존 경로(`admin`, `login`, `me`, `search` 등)와 겹치는 값은 막는다(`lib/menus/schema.ts`의 `RESERVED_SLUGS` = DB check 제약).
- 공개 화면 E2E는 메뉴를 관리자 화면으로 만들고 지운다(`e2e/helpers/menus.ts`). 공개 메뉴 트리가 캐시되어 DB에 직접 넣은 메뉴는 바로 보이지 않기 때문이다.
- E2E는 한 번에 많이 돌리면 Supabase 로그인 코드 검증 한도(기본 5분에 30회)에 걸린다(`Request rate limit reached`). 5분 뒤 다시 돌리거나 `--workers=2`로 나눠 돌린다.
- 메뉴 E2E(`e2e/menus.spec.ts`)는 slug가 `e2e-`로 시작하는 메뉴를 만들고 지운다. 중간에 끊기면 Table Editor에서 `e2e-`로 시작하는 메뉴를 지운다(하위 메뉴부터).

## 게시물(P3)

- 테이블: `posts`(series 문서·board 글), `post_revisions`(게시물당 최근 20개), `attachments`. 파일은 Storage `post-files` 버킷(공개 읽기, 파일 최대 50MB·이미지 10MB, SVG·HTML 불가).
- **본문 보호**: 비회원·회원은 `posts.content`·`draft_*` 컬럼을 DB에서 직접 읽을 수 없다(컬럼 권한). 관리자는 `get_post_editor_content()` RPC로 읽고, 공개 화면은 서버가 교사 전용 블록을 뺀 뒤 내려준다. 쿼리에서 `select("*")` 대신 컬럼을 나열한다.
- **공개 글 수정**: 공개된 글을 고치면 `draft_title`·`draft_content`에만 저장되고, "변경 사항 공개"를 눌러야 사이트에 반영된다.
- **휴지통 자동 삭제**: Vercel Cron이 매일 03:00(KST) `/api/cron/purge-trash`를 호출해 30일 지난 글과 파일을 지운다. Vercel 환경변수에 `CRON_SECRET`(16자 이상 무작위 값, 예: `openssl rand -hex 32`)을 넣어야 동작한다.
- **커스텀 블록**: 콜아웃, YouTube, 교사 전용 박스(제목 아래 Tab으로 들여 쓴 블록이 박스 안 내용, 공개 본문·검색 평문에서 통째로 빠짐), 온라인 저지 문제 링크(문제 번호만 저장).
- **온라인 저지 문제 주소**·**홈 문구**: 관리자 → 설정(`/admin/settings`)에서 바꾼다. 문제 주소를 넣으면 문제 버튼이 바로 활성화되고, 비우면 "준비 중"으로 돌아간다.

- **게시물 관리**(`/admin/posts`): 메뉴·상태 필터, 제목 검색, 여러 개 선택 → 다른 메뉴로 이동(게시글↔게시판이면 경고, 주소가 겹치면 `-2` 등을 붙임)·휴지통, 복제(초안, 첨부 파일도 새 경로로 복사), 메뉴 하나만 고르면 차시 순서 드래그.
- **휴지통**(`/admin/trash`): 복구·영구 삭제(파일 포함). 메뉴가 삭제된 글은 복구할 메뉴를 고른다.
- 게시물이 있는 메뉴를 삭제하면 "다른 메뉴로 옮긴 뒤 삭제" 또는 "함께 휴지통으로"를 고른다(DB도 휴지통에 없는 글이 있는 메뉴 삭제를 막는다).
- **에디터**(`/admin/posts/[id]`): BlockNote 0.51.4(Mantine UI). 0.52부터는 협업용 선택 의존성(yjs v14 rc) 때문에 npm 설치가 실패해 버전을 고정했다. 블록 종류를 바꾸면 `components/editor/schema.ts`와 `lib/posts/content.ts`의 `ALLOWED_BLOCK_TYPES`를 함께 고친다.
  - 입력이 멈추고 3초 뒤 자동 저장, Ctrl/⌘+S로 바로 저장. 이력은 직접 저장·공개·복원 때와 자동 저장 10분마다 남는다.
  - 파일은 서버가 발급한 서명 URL로 브라우저가 Storage에 바로 올리고(Vercel 요청 크기 제한 회피), 서버가 실제 크기·형식을 다시 확인한 뒤 `attachments`에 기록한다.

## 자료 열람·검색·홈(P4)

- 공개 주소: `/메뉴`, `/메뉴/글`, `/그룹/하위메뉴`, `/그룹/하위메뉴/글`(`app/(site)/[...path]`). 하위 메뉴는 그룹 아래에만 있으므로 주소가 겹치지 않는다.
- 본문은 서버 컴포넌트 렌더러(`components/content/post-content.tsx`)가 블록 JSON을 그린다. HTML 문자열을 넣지 않고, 코드 블록은 서버에서 구문 강조한다. 블록 종류를 추가하면 렌더러에도 추가한다.
- 교사 전용 박스: 학생·비회원에게는 서버가 빼고 보낸다(페이지 HTML에도 없음). 승인된 교사·관리자에게만 보인다.
- 관리자는 초안·미공개 수정본을 공개 주소에서 미리 본다(`?preview=1`, 에디터의 "미리보기"). 학생·비회원에게는 404.
- 공개 글·최근 글 조회는 캐시한다(`posts` 태그). 관리자 화면에서 게시물을 바꾸면 바로 갱신된다. **DB에서 직접 고친 내용은 최대 1시간 뒤에 반영**되므로, 급하면 관리자 화면에서 아무 게시물이나 다시 공개하거나 설정을 저장한다.
- 검색(`/search`): 제목·본문 평문 부분 일치(`pg_trgm`), 공개 글만, 교사 전용 박스 내용은 검색되지 않는다.
- Vercel 함수 리전은 서울(`icn1`, `vercel.json`). Supabase(서울)와 가까워 응답이 빠르다.

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
    [menu]/        메뉴 주소(/메뉴, /그룹/하위메뉴)
  admin/           관리자 화면 (admin 전용, menus = 메뉴 관리)
  api/health/      연결 상태 확인
components/
  layout/          헤더·푸터·로고·모바일 메뉴
  ui/              shadcn/ui
lib/
  env.ts           공개 환경변수 (zod 검증)
  env.server.ts    서버 전용 환경변수
  menus/           메뉴 입력 검증·트리 변환·조회(캐시)
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
