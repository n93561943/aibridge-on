-- P7-1 AI 토론 주제(F-09): 생성 기록·비용, 예약(권한·한도·예산) 함수, 대표 공개, AI 설정
--
-- 흐름(서버 lib/ai/discussion.ts)
-- 1. 교사 세션으로 ai_reserve_generation 호출: 권한·AI 켜짐·블록 존재·10분 중복·진행 중·일일 한도·월 예산을
--    회원별 잠금 안에서 검사하고, 통과하면 pending 행을 만든다(동시 요청에도 한도를 넘지 않게).
-- 2. 서버가 Claude API 호출·검증.
-- 3. 서버(service role)가 ai_finish_generation으로 결과·토큰·비용을 기록한다.
--    완료 기록은 회원이 직접 부를 수 없다(비용·결과 위조 방지).
-- 비용 기록은 글·회원이 지워져도 남는다(월 예산 계산이 줄어들지 않게 FK는 set null).

-- ─────────────────────────────────────────────────────────────
-- 생성 기록
-- ─────────────────────────────────────────────────────────────
create table public.ai_generations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles (id) on delete set null,
  post_id uuid references public.posts (id) on delete set null,
  block_id text not null check (char_length(block_id) between 1 and 100),
  -- 키워드·수준·개수·형식·추가 요청(본문 원문은 저장하지 않는다)
  input jsonb not null default '{}'::jsonb,
  -- 본문+설정+추가 요청 해시(10분 안 같은 요청 판단)
  source_hash text not null check (char_length(source_hash) between 16 and 128),
  output jsonb,
  -- pending: 호출 중, success: 주제 생성, blocked: 모델이 부적절한 요청으로 거절, failed: 오류
  status text not null default 'pending'
    check (status in ('pending', 'success', 'failed', 'blocked')),
  error_code text check (error_code is null or char_length(error_code) <= 50),
  is_featured boolean not null default false,
  is_saved boolean not null default false,
  input_tokens int not null default 0 check (input_tokens >= 0),
  output_tokens int not null default 0 check (output_tokens >= 0),
  cost_krw numeric(12, 2) not null default 0 check (cost_krw >= 0),
  model text,
  created_at timestamptz not null default now(),
  finished_at timestamptz,

  constraint ai_generations_featured_success check (not is_featured or status = 'success'),
  constraint ai_generations_saved_success check (not is_saved or status = 'success')
);

comment on table public.ai_generations is 'AI 토론 주제 생성 기록과 비용(F-09). 쓰기는 예약·완료 함수로만.';

create index ai_generations_user_idx on public.ai_generations (user_id, created_at desc);
create index ai_generations_created_idx on public.ai_generations (created_at);
create index ai_generations_dedup_idx
  on public.ai_generations (user_id, post_id, block_id, source_hash, created_at desc);
-- 블록당 대표 공개는 1세트
create unique index ai_generations_featured_once
  on public.ai_generations (post_id, block_id) where is_featured;

-- ─────────────────────────────────────────────────────────────
-- AI 설정(site_settings). 관리자가 /admin/settings에서 바꾼다. 처음에는 꺼 둔다.
-- ─────────────────────────────────────────────────────────────
insert into public.site_settings (key, value) values
  ('ai_enabled', 'false'::jsonb),
  ('ai_monthly_budget_krw', '10000'::jsonb),
  ('usd_krw_rate', '1400'::jsonb),
  ('ai_daily_limit_teacher', '20'::jsonb),
  ('ai_daily_limit_admin', '50'::jsonb)
on conflict (key) do nothing;

alter table public.site_settings add constraint site_settings_ai_values check (
  case key
    when 'ai_enabled' then jsonb_typeof(value) = 'boolean'
    when 'ai_monthly_budget_krw' then
      jsonb_typeof(value) = 'number' and (value #>> '{}')::numeric between 0 and 10000000
    when 'usd_krw_rate' then
      jsonb_typeof(value) = 'number' and (value #>> '{}')::numeric between 100 and 10000
    when 'ai_daily_limit_teacher' then
      jsonb_typeof(value) = 'number' and (value #>> '{}')::numeric between 0 and 1000
      and (value #>> '{}')::numeric = floor((value #>> '{}')::numeric)
    when 'ai_daily_limit_admin' then
      jsonb_typeof(value) = 'number' and (value #>> '{}')::numeric between 0 and 1000
      and (value #>> '{}')::numeric = floor((value #>> '{}')::numeric)
    else true
  end
);

-- 설정이 지워졌으면 안전한 쪽(꺼짐·기본값)으로 본다.
create or replace function public.ai_setting_number(p_key text, p_default numeric)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select (s.value #>> '{}')::numeric from public.site_settings s
     where s.key = p_key and jsonb_typeof(s.value) = 'number'),
    p_default
  );
$$;

create or replace function public.ai_is_enabled()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select (s.value #>> '{}')::boolean from public.site_settings s
     where s.key = 'ai_enabled' and jsonb_typeof(s.value) = 'boolean'),
    false
  );
$$;

revoke execute on function public.ai_setting_number(text, numeric) from public, anon, authenticated;
revoke execute on function public.ai_is_enabled() from public, anon;
grant execute on function public.ai_is_enabled() to authenticated;

-- 한국 시간 기준 오늘·이번 달 시작
create or replace function public.ai_kst_day_start()
returns timestamptz
language sql
stable
set search_path = ''
as $$
  select date_trunc('day', now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul';
$$;

create or replace function public.ai_kst_month_start()
returns timestamptz
language sql
stable
set search_path = ''
as $$
  select date_trunc('month', now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul';
$$;

-- 이번 달 누적 비용(원)
create or replace function public.ai_month_cost_krw()
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(g.cost_krw), 0) from public.ai_generations g
  where g.created_at >= public.ai_kst_month_start();
$$;

revoke execute on function public.ai_month_cost_krw() from public, anon, authenticated;

-- ─────────────────────────────────────────────────────────────
-- 예약: 교사 세션으로 부른다. 결과 상태
--   ok(새로 호출, generation_id) / reused(10분 안 같은 요청, output) / forbidden / disabled /
--   no_block / busy(같은 블록 생성 중) / daily_limit / budget
-- ─────────────────────────────────────────────────────────────
create or replace function public.ai_reserve_generation(
  p_post_id uuid,
  p_block_id text,
  p_source_hash text,
  p_input jsonb,
  p_model text
)
returns table (status text, generation_id uuid, output jsonb)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_uid uuid := auth.uid();
  v_role text;
  v_limit numeric;
  v_existing record;
  v_id uuid;
begin
  select p.role into v_role from public.profiles p
  where p.id = v_uid and p.status = 'active';
  if v_uid is null or v_role is null or v_role not in ('teacher', 'admin') then
    return query select 'forbidden'::text, null::uuid, null::jsonb;
    return;
  end if;
  if not public.ai_is_enabled() then
    return query select 'disabled'::text, null::uuid, null::jsonb;
    return;
  end if;
  if p_block_id is null or char_length(p_block_id) not between 1 and 100
     or p_source_hash is null or char_length(p_source_hash) not between 16 and 128 then
    raise exception '잘못된 요청입니다.' using errcode = 'invalid_parameter_value';
  end if;

  -- 공개된(휴지통·숨김 아님) 글 안에 그 id의 AI 토론 블록이 있어야 한다.
  if not exists (
    select 1 from public.posts p
    where p.id = p_post_id
      and p.status = 'published'
      and p.deleted_at is null
      and p.hidden_at is null
      and jsonb_path_exists(
        p.content,
        '$.** ? (@.id == $id && @.type == "aiDiscussion")',
        jsonb_build_object('id', p_block_id)
      )
  ) then
    return query select 'no_block'::text, null::uuid, null::jsonb;
    return;
  end if;

  -- 회원별로 잠가 동시 요청도 하나씩 검사한다.
  perform pg_advisory_xact_lock(hashtextextended('ai_generation:' || v_uid::text, 0));

  -- 서버가 중간에 멈춰 남은 예약은 실패로 정리(5분)
  update public.ai_generations g
  set status = 'failed', error_code = 'stale', finished_at = now()
  where g.status = 'pending' and g.created_at < now() - interval '5 minutes';

  -- 10분 안 같은 요청은 직전 결과를 돌려준다(실수 연타 방지, 한도·비용 없음)
  select g.id, g.output into v_existing from public.ai_generations g
  where g.user_id = v_uid and g.post_id = p_post_id and g.block_id = p_block_id
    and g.source_hash = p_source_hash and g.status = 'success'
    and g.created_at > now() - interval '10 minutes'
  order by g.created_at desc
  limit 1;
  if found then
    return query select 'reused'::text, v_existing.id, v_existing.output;
    return;
  end if;

  if exists (
    select 1 from public.ai_generations g
    where g.user_id = v_uid and g.post_id = p_post_id and g.block_id = p_block_id
      and g.status = 'pending'
  ) then
    return query select 'busy'::text, null::uuid, null::jsonb;
    return;
  end if;

  v_limit := case v_role
    when 'admin' then public.ai_setting_number('ai_daily_limit_admin', 50)
    else public.ai_setting_number('ai_daily_limit_teacher', 20)
  end;
  if (
    select count(*) from public.ai_generations g
    where g.user_id = v_uid and g.created_at >= public.ai_kst_day_start()
  ) >= v_limit then
    return query select 'daily_limit'::text, null::uuid, null::jsonb;
    return;
  end if;

  -- 월 예산: 사이트 전체 합계. 진행 중인 호출은 아직 비용이 0이라 한 번 정도 넘칠 수 있다(약 10원).
  if public.ai_month_cost_krw() >= public.ai_setting_number('ai_monthly_budget_krw', 0) then
    return query select 'budget'::text, null::uuid, null::jsonb;
    return;
  end if;

  insert into public.ai_generations (user_id, post_id, block_id, input, source_hash, model)
  values (v_uid, p_post_id, p_block_id, coalesce(p_input, '{}'::jsonb), p_source_hash, p_model)
  returning id into v_id;
  return query select 'ok'::text, v_id, null::jsonb;
end;
$$;

revoke execute on function public.ai_reserve_generation(uuid, text, text, jsonb, text)
  from public, anon;
grant execute on function public.ai_reserve_generation(uuid, text, text, jsonb, text)
  to authenticated;

-- ─────────────────────────────────────────────────────────────
-- 완료 기록: 서버(service role)만. 회원은 부를 수 없다(결과·비용 위조 방지).
-- ─────────────────────────────────────────────────────────────
create or replace function public.ai_finish_generation(
  p_id uuid,
  p_status text,
  p_output jsonb,
  p_input_tokens int,
  p_output_tokens int,
  p_cost_krw numeric,
  p_model text,
  p_error_code text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_status is null or p_status not in ('success', 'failed', 'blocked') then
    raise exception '상태가 올바르지 않습니다.' using errcode = 'invalid_parameter_value';
  end if;
  update public.ai_generations g
  set status = p_status,
      output = p_output,
      input_tokens = greatest(coalesce(p_input_tokens, 0), 0),
      output_tokens = greatest(coalesce(p_output_tokens, 0), 0),
      cost_krw = greatest(coalesce(p_cost_krw, 0), 0),
      model = coalesce(p_model, g.model),
      error_code = p_error_code,
      finished_at = now()
  where g.id = p_id and g.status = 'pending';
  if not found then
    raise exception '진행 중인 생성이 아닙니다.' using errcode = 'P0002';
  end if;
end;
$$;

revoke execute on function public.ai_finish_generation(uuid, text, jsonb, int, int, numeric, text, text)
  from public, anon, authenticated;

-- ─────────────────────────────────────────────────────────────
-- 대표 공개(관리자): 블록당 1세트, 새로 공개하면 교체
-- ─────────────────────────────────────────────────────────────
create or replace function public.ai_set_featured(p_id uuid, p_featured boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row record;
begin
  if not public.is_admin() then
    raise exception '관리자만 대표 주제를 공개할 수 있습니다.' using errcode = 'insufficient_privilege';
  end if;
  select g.post_id, g.block_id, g.status into v_row
  from public.ai_generations g where g.id = p_id for update;
  if not found or v_row.status <> 'success' or v_row.post_id is null then
    raise exception '공개할 수 있는 결과가 아닙니다.' using errcode = 'P0002';
  end if;
  if p_featured then
    update public.ai_generations g set is_featured = false
    where g.post_id = v_row.post_id and g.block_id = v_row.block_id and g.is_featured;
  end if;
  update public.ai_generations g set is_featured = p_featured where g.id = p_id;
end;
$$;

revoke execute on function public.ai_set_featured(uuid, boolean) from public, anon;
grant execute on function public.ai_set_featured(uuid, boolean) to authenticated;

-- ─────────────────────────────────────────────────────────────
-- RLS: 본인 기록 조회·보관함 저장, 관리자 전체 조회. 대표 공개 결과는 서버가 주제만 골라 공개한다.
-- ─────────────────────────────────────────────────────────────
alter table public.ai_generations enable row level security;

revoke all on public.ai_generations from anon, authenticated;
grant select on public.ai_generations to authenticated;
grant update (is_saved) on public.ai_generations to authenticated;

create policy "본인 생성 기록 조회" on public.ai_generations
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy "관리자 생성 기록 조회" on public.ai_generations
  for select to authenticated
  using ((select public.is_admin()));

-- 보관함 저장은 본인 성공 결과만(활동 중인 교사 이상)
create policy "본인 결과 보관함 저장" on public.ai_generations
  for update to authenticated
  using (
    user_id = (select auth.uid())
    and status = 'success'
    and (select public.current_user_role()) in ('teacher', 'admin')
    and (select public.is_active_member())
  )
  with check (user_id = (select auth.uid()));
