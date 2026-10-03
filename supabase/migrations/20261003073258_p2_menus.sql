-- P2 메뉴: menus 테이블, 깊이·유형 제약, 순서 변경 함수, RLS, 시드 메뉴(SPEC 4장)

-- ─────────────────────────────────────────────────────────────
-- menus: 헤더 메뉴 트리(최대 2단계). 하위 메뉴는 group 아래에만 둔다.
-- ─────────────────────────────────────────────────────────────
create table public.menus (
  id uuid primary key default gen_random_uuid(),
  -- 하위 메뉴가 있는 메뉴는 지울 수 없다(먼저 하위 메뉴를 옮기거나 지운다).
  parent_id uuid references public.menus (id) on delete restrict,
  title text not null check (char_length(btrim(title)) between 1 and 30),
  -- 기존 라우트와 겹치는 slug는 금지(lib/menus/schema.ts의 RESERVED_SLUGS와 같게 유지)
  slug text not null unique check (
    slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
    and char_length(slug) <= 50
    and slug not in (
      'admin', 'api', 'auth', 'guardian', 'login', 'logout', 'me', 'privacy',
      'search', 'signup', 'submit', 'terms'
    )
  ),
  type text not null check (type in ('series', 'board', 'link', 'group')),
  external_url text check (external_url is null or external_url ~ '^https?://'),
  board_write_role text check (
    board_write_role is null or board_write_role in ('student', 'teacher', 'admin')
  ),
  board_allow_comments boolean not null default true,
  board_allow_votes boolean not null default true,
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint menus_not_self_parent check (parent_id is null or parent_id <> id),
  -- 외부 URL은 link만, 글쓰기 등급은 board만(board는 필수)
  constraint menus_link_url check (type = 'link' or external_url is null),
  constraint menus_board_role check ((type = 'board') = (board_write_role is not null)),
  -- URL이 없는 link는 활성화할 수 없다(온라인 저지 주소 미정 상태로 시드)
  constraint menus_active_link_has_url check (
    type <> 'link' or not is_active or external_url is not null
  )
);

comment on table public.menus is '헤더 메뉴(최대 2단계). 관리자만 변경하고, 활성 메뉴는 누구나 읽는다.';

create index menus_parent_sort_idx on public.menus (parent_id, sort_order);

create trigger menus_set_updated_at
  before update on public.menus
  for each row execute function public.set_updated_at();

-- 깊이 2단계·상위 메뉴 유형 검사: 상위는 최상위 group만, group은 하위 메뉴가 될 수 없다.
create or replace function public.check_menu_hierarchy()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_parent public.menus;
begin
  if new.parent_id is not null then
    if new.type = 'group' then
      raise exception '그룹 메뉴는 하위 메뉴가 될 수 없습니다.' using errcode = 'check_violation';
    end if;
    select * into v_parent from public.menus where id = new.parent_id;
    if v_parent.type is distinct from 'group' or v_parent.parent_id is not null then
      raise exception '상위 메뉴는 최상위 그룹 메뉴만 될 수 있습니다.' using errcode = 'check_violation';
    end if;
  end if;

  -- 하위 메뉴가 있는 그룹은 유형을 바꾸거나 다른 메뉴 아래로 옮길 수 없다.
  if tg_op = 'UPDATE'
    and (new.type <> 'group' or new.parent_id is not null)
    and exists (select 1 from public.menus c where c.parent_id = new.id)
  then
    raise exception '하위 메뉴가 있는 그룹은 유형이나 위치를 바꿀 수 없습니다.'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

create trigger menus_check_hierarchy
  before insert or update of parent_id, type on public.menus
  for each row execute function public.check_menu_hierarchy();

-- 같은 상위 메뉴(p_parent_id, 최상위는 null) 안의 순서를 한 번에 바꾼다. 형제 메뉴 전체를 빠짐없이 넘겨야 한다.
-- security invoker: 호출자 권한(RLS)으로 실행되므로 관리자만 실제로 바꿀 수 있다.
create or replace function public.reorder_menus(p_ids uuid[], p_parent_id uuid default null)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_expected uuid[];
begin
  if not (select public.is_admin()) then
    raise exception '관리자만 메뉴 순서를 바꿀 수 있습니다.' using errcode = 'insufficient_privilege';
  end if;

  select coalesce(array_agg(id order by id), '{}') into v_expected
  from public.menus
  where parent_id is not distinct from p_parent_id;

  if v_expected <> (select coalesce(array_agg(x order by x), '{}') from unnest(p_ids) as x) then
    raise exception '메뉴 목록이 바뀌었습니다. 새로고침 후 다시 시도해 주세요.'
      using errcode = 'check_violation';
  end if;

  update public.menus m
  set sort_order = o.ord
  from unnest(p_ids) with ordinality as o (id, ord)
  where m.id = o.id and m.sort_order is distinct from o.ord;
end;
$$;

revoke execute on function public.reorder_menus(uuid[], uuid) from public, anon;
grant execute on function public.reorder_menus(uuid[], uuid) to authenticated;

-- ─────────────────────────────────────────────────────────────
-- RLS: 활성 메뉴는 누구나 조회, 비활성 메뉴 조회와 모든 변경은 관리자만
-- ─────────────────────────────────────────────────────────────
alter table public.menus enable row level security;

revoke all on public.menus from anon, authenticated;
grant select on public.menus to anon, authenticated;
grant insert, update, delete on public.menus to authenticated;

create policy "활성 메뉴 조회" on public.menus
  for select to anon, authenticated
  using (is_active);

create policy "관리자 전체 메뉴 조회" on public.menus
  for select to authenticated
  using ((select public.is_admin()));

create policy "관리자 메뉴 추가" on public.menus
  for insert to authenticated
  with check ((select public.is_admin()));

create policy "관리자 메뉴 수정" on public.menus
  for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

create policy "관리자 메뉴 삭제" on public.menus
  for delete to authenticated
  using ((select public.is_admin()));

-- ─────────────────────────────────────────────────────────────
-- 시드 메뉴(SPEC 4장). 원격 프로젝트는 seed.sql을 실행하지 않으므로 마이그레이션에 둔다.
-- 이미 같은 slug가 있으면 건너뛴다. 온라인 저지는 주소 미정이라 비활성으로 넣는다.
-- ─────────────────────────────────────────────────────────────
insert into public.menus (slug, title, type, sort_order) values
  ('ai-literacy', 'AI 리터러시', 'series', 1),
  ('ai-coding', 'AI 코딩', 'group', 2),
  ('vibe-coding', '바이브코딩', 'series', 3)
on conflict (slug) do nothing;

insert into public.menus (slug, title, type, board_write_role, sort_order) values
  ('notice', '공지사항', 'board', 'admin', 4)
on conflict (slug) do nothing;

insert into public.menus (parent_id, slug, title, type, is_active, sort_order)
select g.id, v.slug, v.title, v.type, v.is_active, v.sort_order
from public.menus g
cross join (values
  ('python-basics', '파이썬 기초 코딩', 'series', true, 1),
  ('online-judge', '온라인 저지', 'link', false, 2),
  ('ai-programming', '인공지능 코딩', 'series', true, 3)
) as v (slug, title, type, is_active, sort_order)
where g.slug = 'ai-coding' and g.type = 'group' and g.parent_id is null
on conflict (slug) do nothing;
