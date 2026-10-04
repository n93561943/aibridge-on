-- P6 회원 관리(F-03): 관리자 전용 RPC와 감사 로그
--
-- 역할·상태·교사 심사 컬럼은 회원이 직접 바꿀 수 없다(P1 컬럼 권한). 관리자 변경은 아래 함수로만 하며,
-- 함수가 관리자 여부와 안전 규칙을 DB에서 다시 검사한다(화면·서버·DB 3중 검사).
-- 안전 규칙
-- - 자기 자신의 등급·상태는 바꿀 수 없다(강제 탈퇴도 불가).
-- - 마지막 활동 관리자는 강등·정지·강제 탈퇴할 수 없다.
-- - 만 14세 미만은 교사·관리자가 될 수 없다.
-- - 보호자 동의 대기 회원은 정지·해제 대상이 아니다(동의 절차가 상태를 정한다).
-- 모든 변경은 admin_audit_logs에 남는다(관리자만 조회).

-- ─────────────────────────────────────────────────────────────
-- 감사 로그. 대상 회원이 탈퇴해도 이력은 남도록 대상 id에 FK를 걸지 않는다.
-- ─────────────────────────────────────────────────────────────
create table public.admin_audit_logs (
  id bigint generated always as identity primary key,
  actor_id uuid references public.profiles (id) on delete set null,
  action text not null check (action in (
    'teacher_approve', 'teacher_reject', 'role_change', 'status_change',
    'force_withdraw', 'guardian_resend'
  )),
  target_user_id uuid not null,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

comment on table public.admin_audit_logs is '관리자 회원 관리 이력. 관리자 RPC만 기록하고 관리자만 읽는다.';

create index admin_audit_logs_target_idx on public.admin_audit_logs (target_user_id, created_at desc);
create index admin_audit_logs_created_idx on public.admin_audit_logs (created_at desc);

alter table public.admin_audit_logs enable row level security;
revoke all on public.admin_audit_logs from anon, authenticated;
grant select on public.admin_audit_logs to authenticated;

create policy "관리자 감사 로그 조회" on public.admin_audit_logs
  for select to authenticated
  using ((select public.is_admin()));

-- ─────────────────────────────────────────────────────────────
-- 내부 헬퍼
-- ─────────────────────────────────────────────────────────────
create or replace function public.require_admin()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception '관리자만 할 수 있습니다.' using errcode = 'insufficient_privilege';
  end if;
  return auth.uid();
end;
$$;

-- p_user를 빼고도 활동 관리자가 남는가. 동시에 두 관리자가 서로를 강등하지 못하게 잠근다.
create or replace function public.other_active_admin_exists(p_user uuid)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('admin_roles', 0));
  return exists (
    select 1 from public.profiles p
    where p.role = 'admin' and p.status = 'active' and p.id <> p_user
  );
end;
$$;

revoke execute on function public.require_admin() from public, anon, authenticated;
revoke execute on function public.other_active_admin_exists(uuid) from public, anon, authenticated;

-- ─────────────────────────────────────────────────────────────
-- 교사 신청 승인·반려(여러 명). 처리된 회원의 메일 주소를 돌려준다(결과 메일 발송용).
-- 승인: 등급 teacher(관리자는 그대로), 반려: 사유 필수, 등급은 그대로.
-- ─────────────────────────────────────────────────────────────
create or replace function public.admin_review_teachers(
  p_ids uuid[],
  p_approve boolean,
  p_reason text default null
)
returns table (id uuid, email text, nickname text)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_actor uuid := public.require_admin();
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if p_ids is null or cardinality(p_ids) = 0 or cardinality(p_ids) > 100 then
    raise exception '처리할 회원을 1~100명 골라 주세요.' using errcode = 'invalid_parameter_value';
  end if;
  if not p_approve and (v_reason is null or char_length(v_reason) > 300) then
    raise exception '반려 사유를 300자 이내로 입력해 주세요.' using errcode = 'invalid_parameter_value';
  end if;

  return query
  with reviewed as (
    update public.profiles p
    set role = case when p_approve and p.role <> 'admin' then 'teacher' else p.role end,
        teacher_status = case when p_approve then 'approved' else 'rejected' end,
        teacher_reviewed_at = now(),
        teacher_reject_reason = case when p_approve then null else v_reason end
    where p.id = any (p_ids)
      and p.teacher_status = 'pending'
      and not p.is_under_14
    returning p.id, p.email, p.nickname
  ), logged as (
    insert into public.admin_audit_logs (actor_id, action, target_user_id, detail)
    select v_actor,
           case when p_approve then 'teacher_approve' else 'teacher_reject' end,
           r.id,
           case when p_approve then '{}'::jsonb else jsonb_build_object('reason', v_reason) end
    from reviewed r
  )
  select r.id, r.email, r.nickname from reviewed r;
end;
$$;

-- ─────────────────────────────────────────────────────────────
-- 등급 변경
-- ─────────────────────────────────────────────────────────────
create or replace function public.admin_set_role(p_user uuid, p_role text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := public.require_admin();
  v_target record;
begin
  if p_role is null or p_role not in ('student', 'teacher', 'admin') then
    raise exception '등급이 올바르지 않습니다.' using errcode = 'invalid_parameter_value';
  end if;
  if p_user = v_actor then
    raise exception '자기 자신의 등급은 바꿀 수 없습니다.' using errcode = 'insufficient_privilege';
  end if;

  select p.role, p.status, p.is_under_14, p.teacher_status into v_target
  from public.profiles p where p.id = p_user for update;
  if not found then
    raise exception '회원을 찾을 수 없습니다.' using errcode = 'P0002';
  end if;
  if v_target.role = p_role then
    return;
  end if;
  if v_target.is_under_14 and p_role <> 'student' then
    raise exception '만 14세 미만 회원은 교사·관리자가 될 수 없습니다.' using errcode = 'check_violation';
  end if;
  if v_target.role = 'admin' and v_target.status = 'active'
     and not public.other_active_admin_exists(p_user) then
    raise exception '마지막 관리자의 등급은 내릴 수 없습니다.' using errcode = 'check_violation';
  end if;

  update public.profiles p
  set role = p_role,
      -- 교사 신청 중이면 승인으로, 교사에서 학생으로 내리면 다시 신청할 수 있게 비운다.
      teacher_status = case
        when p_role in ('teacher', 'admin') and p.teacher_status = 'pending' then 'approved'
        when p_role = 'student' and p.teacher_status = 'approved' then 'none'
        else p.teacher_status
      end,
      teacher_reviewed_at = case
        when p_role in ('teacher', 'admin') and p.teacher_status = 'pending' then now()
        else p.teacher_reviewed_at
      end
  where p.id = p_user;

  insert into public.admin_audit_logs (actor_id, action, target_user_id, detail)
  values (v_actor, 'role_change', p_user, jsonb_build_object('from', v_target.role, 'to', p_role));
end;
$$;

-- ─────────────────────────────────────────────────────────────
-- 정지·해제
-- ─────────────────────────────────────────────────────────────
create or replace function public.admin_set_status(p_user uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := public.require_admin();
  v_target record;
begin
  if p_status is null or p_status not in ('active', 'suspended') then
    raise exception '상태가 올바르지 않습니다.' using errcode = 'invalid_parameter_value';
  end if;
  if p_user = v_actor then
    raise exception '자기 자신은 정지할 수 없습니다.' using errcode = 'insufficient_privilege';
  end if;

  select p.role, p.status into v_target
  from public.profiles p where p.id = p_user for update;
  if not found then
    raise exception '회원을 찾을 수 없습니다.' using errcode = 'P0002';
  end if;
  if v_target.status = 'pending_guardian' then
    raise exception '보호자 동의 대기 회원은 정지·해제할 수 없습니다.' using errcode = 'check_violation';
  end if;
  if v_target.status = p_status then
    return;
  end if;
  if p_status = 'suspended' and v_target.role = 'admin'
     and not public.other_active_admin_exists(p_user) then
    raise exception '마지막 관리자는 정지할 수 없습니다.' using errcode = 'check_violation';
  end if;

  update public.profiles p set status = p_status where p.id = p_user;

  insert into public.admin_audit_logs (actor_id, action, target_user_id, detail)
  values (v_actor, 'status_change', p_user,
          jsonb_build_object('from', v_target.status, 'to', p_status));
end;
$$;

-- ─────────────────────────────────────────────────────────────
-- 강제 탈퇴 준비: 규칙 검사 + 기록. 실제 계정 삭제(auth.admin.deleteUser)는 서버가 이어서 한다.
-- 삭제가 실패해도 시도 이력은 남는다(detail에 닉네임만 남기고 이메일은 남기지 않는다).
-- ─────────────────────────────────────────────────────────────
create or replace function public.admin_prepare_withdraw(p_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := public.require_admin();
  v_target record;
begin
  if p_user = v_actor then
    raise exception '자기 자신은 강제 탈퇴할 수 없습니다. 내 정보에서 탈퇴해 주세요.'
      using errcode = 'insufficient_privilege';
  end if;
  select p.role, p.status, p.nickname into v_target
  from public.profiles p where p.id = p_user for update;
  if not found then
    raise exception '회원을 찾을 수 없습니다.' using errcode = 'P0002';
  end if;
  if v_target.role = 'admin' and v_target.status = 'active'
     and not public.other_active_admin_exists(p_user) then
    raise exception '마지막 관리자는 탈퇴시킬 수 없습니다.' using errcode = 'check_violation';
  end if;

  insert into public.admin_audit_logs (actor_id, action, target_user_id, detail)
  values (v_actor, 'force_withdraw', p_user, jsonb_build_object('nickname', v_target.nickname));
end;
$$;

-- ─────────────────────────────────────────────────────────────
-- 보호자 동의 메일 재발송 기록(발송 자체는 서버가 기존 sendGuardianConsent로).
-- ─────────────────────────────────────────────────────────────
create or replace function public.admin_log_guardian_resend(p_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := public.require_admin();
begin
  if not exists (
    select 1 from public.profiles p where p.id = p_user and p.status = 'pending_guardian'
  ) then
    raise exception '보호자 동의 대기 회원이 아닙니다.' using errcode = 'check_violation';
  end if;
  insert into public.admin_audit_logs (actor_id, action, target_user_id)
  values (v_actor, 'guardian_resend', p_user);
end;
$$;

revoke execute on function public.admin_review_teachers(uuid[], boolean, text) from public, anon;
revoke execute on function public.admin_set_role(uuid, text) from public, anon;
revoke execute on function public.admin_set_status(uuid, text) from public, anon;
revoke execute on function public.admin_prepare_withdraw(uuid) from public, anon;
revoke execute on function public.admin_log_guardian_resend(uuid) from public, anon;
grant execute on function public.admin_review_teachers(uuid[], boolean, text) to authenticated;
grant execute on function public.admin_set_role(uuid, text) to authenticated;
grant execute on function public.admin_set_status(uuid, text) to authenticated;
grant execute on function public.admin_prepare_withdraw(uuid) to authenticated;
grant execute on function public.admin_log_guardian_resend(uuid) to authenticated;
