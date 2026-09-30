-- P1 인증·가입: profiles, guardian_consents, otp_attempts, 권한 헬퍼, 자동 삭제 작업

-- ─────────────────────────────────────────────────────────────
-- 공통: updated_at 자동 갱신
-- ─────────────────────────────────────────────────────────────
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ─────────────────────────────────────────────────────────────
-- profiles: auth.users와 1:1. 가입(/signup) 완료 시 서버(service role)가 만든다.
-- ─────────────────────────────────────────────────────────────
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null unique check (email = lower(email)),
  nickname text not null check (char_length(nickname) between 2 and 20),
  name text check (name is null or char_length(name) <= 50),
  role text not null default 'student' check (role in ('student', 'teacher', 'admin')),
  teacher_school text check (teacher_school is null or char_length(teacher_school) <= 100),
  teacher_position text check (
    teacher_position is null or teacher_position in ('교사', '부장교사', '교감', '교장', '기타')
  ),
  teacher_subject text check (teacher_subject is null or char_length(teacher_subject) <= 50),
  teacher_status text not null default 'none'
    check (teacher_status in ('none', 'pending', 'approved', 'rejected')),
  teacher_requested_at timestamptz,
  teacher_reviewed_at timestamptz,
  teacher_reject_reason text,
  is_under_14 boolean not null,
  guardian_email text check (guardian_email is null or guardian_email = lower(guardian_email)),
  guardian_consented_at timestamptz,
  status text not null default 'active' check (status in ('pending_guardian', 'active', 'suspended')),
  privacy_agreed_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_login_at timestamptz,

  -- 만 14세 미만은 보호자 이메일 필수, 교사 신청 불가
  constraint profiles_under_14_guardian check (not is_under_14 or guardian_email is not null),
  constraint profiles_under_14_no_teacher check (not is_under_14 or teacher_status = 'none'),
  -- 보호자 동의 대기는 만 14세 미만만
  constraint profiles_pending_guardian_under_14 check (status <> 'pending_guardian' or is_under_14),
  -- 교사 신청 이력이 있으면 학교·직급·과목 필수
  constraint profiles_teacher_fields check (
    teacher_status = 'none'
    or (teacher_school is not null and teacher_position is not null and teacher_subject is not null)
  )
);

comment on table public.profiles is '회원 프로필(auth.users와 1:1). 역할·상태·14세 관련 컬럼은 서버만 변경한다.';

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

create index profiles_teacher_status_idx on public.profiles (teacher_status)
  where teacher_status = 'pending';
create index profiles_pending_guardian_idx on public.profiles (created_at)
  where status = 'pending_guardian';

-- ─────────────────────────────────────────────────────────────
-- guardian_consents: 보호자 동의 요청 기록. 토큰은 해시만 저장한다.
-- ─────────────────────────────────────────────────────────────
create table public.guardian_consents (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  guardian_email text not null,
  token_hash text not null unique,
  expires_at timestamptz not null,
  consented_at timestamptz,
  revoked_at timestamptz,          -- 재발송으로 무효화된 토큰
  created_at timestamptz not null default now()
);

create index guardian_consents_profile_idx on public.guardian_consents (profile_id, created_at desc);

-- ─────────────────────────────────────────────────────────────
-- otp_attempts: 로그인 코드 오류 횟수(5회 초과 시 해당 코드 무효). 이메일은 해시로만 저장.
-- ─────────────────────────────────────────────────────────────
create table public.otp_attempts (
  email_hash text primary key,
  fail_count int not null default 0,
  issued_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────
-- 권한 헬퍼 (RLS 정책에서 사용). security definer로 profiles RLS 재귀를 피한다.
-- ─────────────────────────────────────────────────────────────
create or replace function public.current_user_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select p.role from public.profiles p where p.id = (select auth.uid());
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.role = 'admin' and p.status = 'active'
  );
$$;

-- 활동 가능한 회원(보호자 동의 대기·정지 제외). 댓글·추천·글쓰기·AI 권한 판단에 쓴다.
create or replace function public.is_active_member()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.status = 'active'
  );
$$;

revoke execute on function public.current_user_role() from public, anon;
revoke execute on function public.is_admin() from public, anon;
revoke execute on function public.is_active_member() from public, anon;
grant execute on function public.current_user_role() to authenticated;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.is_active_member() to authenticated;

-- ─────────────────────────────────────────────────────────────
-- RLS
-- ─────────────────────────────────────────────────────────────
alter table public.profiles enable row level security;
alter table public.guardian_consents enable row level security;
alter table public.otp_attempts enable row level security;

-- profiles: 비회원 접근 없음. 회원은 본인 행만, 관리자는 전체 조회.
revoke all on public.profiles from anon;
revoke insert, update, delete, truncate, references, trigger on public.profiles from authenticated;
-- 사용자가 직접 바꿀 수 있는 컬럼만 허용(역할·상태·14세·보호자·교사 심사 컬럼은 서버 전용)
grant update (nickname, name, teacher_school, teacher_position, teacher_subject)
  on public.profiles to authenticated;

create policy "본인 프로필 조회" on public.profiles
  for select to authenticated
  using (id = (select auth.uid()));

create policy "관리자 전체 프로필 조회" on public.profiles
  for select to authenticated
  using ((select public.is_admin()));

create policy "본인 프로필 수정" on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- guardian_consents, otp_attempts: service role 전용(정책 없음 + 권한 회수)
revoke all on public.guardian_consents from anon, authenticated;
revoke all on public.otp_attempts from anon, authenticated;

-- ─────────────────────────────────────────────────────────────
-- 자동 삭제: 보호자 동의 7일 경과, 가입 미완료 7일 경과 계정 (개인정보 보호)
-- ─────────────────────────────────────────────────────────────
create or replace function public.purge_expired_accounts()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- 만 14세 미만: 가입 후 7일 안에 보호자 동의가 없으면 계정과 개인정보 삭제(profiles·consents는 cascade)
  delete from auth.users u
  using public.profiles p
  where p.id = u.id
    and p.status = 'pending_guardian'
    and p.created_at < now() - interval '7 days';

  -- 로그인만 하고 가입(/signup)을 끝내지 않은 계정
  delete from auth.users u
  where u.created_at < now() - interval '7 days'
    and not exists (select 1 from public.profiles p where p.id = u.id);

  -- 오래된 로그인 코드 오류 기록
  delete from public.otp_attempts where updated_at < now() - interval '1 day';
end;
$$;

revoke execute on function public.purge_expired_accounts() from public, anon, authenticated;

create extension if not exists pg_cron;

select cron.schedule(
  'purge-expired-accounts',
  '0 * * * *',
  $$select public.purge_expired_accounts()$$
);
