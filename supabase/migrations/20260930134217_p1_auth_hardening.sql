-- P1 리뷰 반영: 경쟁 조건 제거(원자적 DB 함수), 보호자 토큰 1개 강제, 닉네임 형식 DB 검사,
-- 정지·동의 대기 회원의 역할 헬퍼 결과 제한

-- ─────────────────────────────────────────────────────────────
-- 닉네임 형식: 서버 zod 검사와 같은 규칙을 DB에서도 강제(RLS 직접 수정 경로 대비)
-- ─────────────────────────────────────────────────────────────
alter table public.profiles
  add constraint profiles_nickname_format check (nickname ~ '^[가-힣a-zA-Z0-9_-]{2,20}$');

-- ─────────────────────────────────────────────────────────────
-- 역할 헬퍼: 활동 가능한(active) 회원만 역할을 돌려준다. 정지·보호자 동의 대기면 null.
-- ─────────────────────────────────────────────────────────────
create or replace function public.current_user_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select p.role from public.profiles p
  where p.id = (select auth.uid()) and p.status = 'active';
$$;

-- ─────────────────────────────────────────────────────────────
-- 로그인 코드 시도 차감(원자적). 검증 전에 1회를 먼저 차감하고 누적 횟수를 돌려준다.
-- p_delta = -1은 인증 서버 오류(429·5xx)로 검증을 못 한 경우의 환불.
-- ─────────────────────────────────────────────────────────────
create or replace function public.consume_otp_attempt(p_email_hash text, p_delta int default 1)
returns int
language sql
security definer
set search_path = ''
as $$
  insert into public.otp_attempts as o (email_hash, fail_count, issued_at, updated_at)
  values (p_email_hash, greatest(p_delta, 0), now(), now())
  on conflict (email_hash) do update
    set fail_count = greatest(o.fail_count + p_delta, 0),
        updated_at = now()
  returning fail_count;
$$;

revoke execute on function public.consume_otp_attempt(text, int) from public, anon, authenticated;

-- ─────────────────────────────────────────────────────────────
-- 보호자 동의 토큰: 한 계정에 유효(미사용·미무효) 토큰은 하나만
-- ─────────────────────────────────────────────────────────────
create unique index guardian_consents_one_active_idx
  on public.guardian_consents (profile_id)
  where consented_at is null and revoked_at is null;

-- 발송 제한 검사 → 이전 토큰 무효화 → 새 토큰 저장을 한 트랜잭션에서 처리한다.
-- 반환: 'ok' | 'cooldown:<남은 초>' | 'daily_limit' | 'expired'(계정 삭제 기한 지남) | 'not_pending'
create or replace function public.issue_guardian_token(
  p_profile_id uuid,
  p_token_hash text,
  p_expires_at timestamptz,
  p_cooldown_seconds int,
  p_daily_limit int
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile public.profiles%rowtype;
  v_recent int;
  v_last timestamptz;
begin
  -- 같은 계정의 동시 요청을 직렬화한다.
  select * into v_profile from public.profiles where id = p_profile_id for update;
  if not found or v_profile.status <> 'pending_guardian' or v_profile.guardian_email is null then
    return 'not_pending';
  end if;
  if p_expires_at <= now() then
    return 'expired';
  end if;

  select count(*), max(created_at) into v_recent, v_last
  from public.guardian_consents
  where profile_id = p_profile_id and created_at > now() - interval '1 day';

  if v_recent >= p_daily_limit then
    return 'daily_limit';
  end if;
  if v_last is not null and v_last > now() - make_interval(secs => p_cooldown_seconds) then
    return 'cooldown:' || ceil(extract(epoch from (v_last + make_interval(secs => p_cooldown_seconds) - now())))::int;
  end if;

  update public.guardian_consents
    set revoked_at = now()
    where profile_id = p_profile_id and consented_at is null and revoked_at is null;

  insert into public.guardian_consents (profile_id, guardian_email, token_hash, expires_at)
  values (p_profile_id, v_profile.guardian_email, p_token_hash, p_expires_at);

  return 'ok';
end;
$$;

revoke execute on function public.issue_guardian_token(uuid, text, timestamptz, int, int)
  from public, anon, authenticated;

-- 보호자 동의 처리(토큰 1회 사용 + 계정 활성화)를 한 트랜잭션에서 처리한다.
-- 반환: 'ok' | 'not_found' | 'used' | 'revoked' | 'expired'
create or replace function public.give_guardian_consent(p_token_hash text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_consent public.guardian_consents%rowtype;
  v_status text;
begin
  select * into v_consent from public.guardian_consents
  where token_hash = p_token_hash for update;
  if not found then return 'not_found'; end if;
  if v_consent.consented_at is not null then return 'used'; end if;
  if v_consent.revoked_at is not null then return 'revoked'; end if;
  if v_consent.expires_at <= now() then return 'expired'; end if;

  select status into v_status from public.profiles where id = v_consent.profile_id for update;
  if v_status is distinct from 'pending_guardian' then return 'used'; end if;

  update public.guardian_consents set consented_at = now() where id = v_consent.id;
  update public.profiles
    set status = 'active', guardian_consented_at = now()
    where id = v_consent.profile_id;
  return 'ok';
end;
$$;

revoke execute on function public.give_guardian_consent(text) from public, anon, authenticated;

-- 서버(service role)에서만 호출한다.
grant execute on function public.consume_otp_attempt(text, int) to service_role;
grant execute on function public.issue_guardian_token(uuid, text, timestamptz, int, int) to service_role;
grant execute on function public.give_guardian_consent(text) to service_role;
grant execute on function public.purge_expired_accounts() to service_role;
