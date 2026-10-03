-- P3 site_settings: 키-값 사이트 설정(SPEC 5장). [미정] 값은 코드가 아니라 여기에 둔다.
-- 지금 쓰는 키: online_judge_problem_url — 문제 주소 형식(예: "https://judge.example.com/problem/{id}").
-- 값이 없으면 온라인 저지 문제 링크 버튼은 "준비 중"으로 비활성화된다(결정 3).

create table public.site_settings (
  key text primary key check (key ~ '^[a-z][a-z0-9_]{1,62}$'),
  value jsonb not null,
  updated_at timestamptz not null default now()
);

comment on table public.site_settings is '사이트 설정(키-값). 공개 키만 누구나 읽고, 변경은 관리자만.';

create trigger site_settings_set_updated_at
  before update on public.site_settings
  for each row execute function public.set_updated_at();

-- 온라인 저지 주소 형식 검사: https(또는 http) 주소이고 {id} 자리가 있어야 한다.
alter table public.site_settings add constraint site_settings_online_judge_url check (
  key <> 'online_judge_problem_url'
  or value = 'null'::jsonb
  or (
    jsonb_typeof(value) = 'string'
    and (value #>> '{}') ~ '^https?://[^\s]+$'
    and position('{id}' in (value #>> '{}')) > 0
  )
);

alter table public.site_settings enable row level security;

revoke all on public.site_settings from anon, authenticated;
grant select on public.site_settings to anon, authenticated;
grant insert, update, delete on public.site_settings to authenticated;

-- 공개해도 되는 키만 누구나 읽는다(AI 예산 등은 관리자만).
create policy "공개 설정 조회" on public.site_settings
  for select to anon, authenticated
  using (key in ('online_judge_problem_url', 'home_hero_text'));

create policy "관리자 설정 조회" on public.site_settings
  for select to authenticated
  using ((select public.is_admin()));

create policy "관리자 설정 변경" on public.site_settings
  for all to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));
