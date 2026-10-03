-- P3 게시물 관리: 차시 순서 일괄 변경

-- 한 메뉴 안(휴지통 제외)의 게시물 순서를 한 번에 바꾼다. 해당 메뉴의 게시물 전체를 빠짐없이 넘겨야 한다.
-- security invoker: 호출자 권한(RLS)으로 실행되므로 관리자만 실제로 바꿀 수 있다.
create or replace function public.reorder_posts(p_menu_id uuid, p_ids uuid[])
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_expected uuid[];
begin
  if not (select public.is_admin()) then
    raise exception '관리자만 게시물 순서를 바꿀 수 있습니다.' using errcode = 'insufficient_privilege';
  end if;

  select coalesce(array_agg(id order by id), '{}') into v_expected
  from public.posts
  where menu_id = p_menu_id and deleted_at is null;

  if v_expected <> (select coalesce(array_agg(x order by x), '{}') from unnest(p_ids) as x) then
    raise exception '게시물 목록이 바뀌었습니다. 새로고침 후 다시 시도해 주세요.'
      using errcode = 'check_violation';
  end if;

  update public.posts p
  set sort_order = o.ord
  from unnest(p_ids) with ordinality as o (id, ord)
  where p.id = o.id and p.sort_order is distinct from o.ord;
end;
$$;

revoke execute on function public.reorder_posts(uuid, uuid[]) from public, anon;
grant execute on function public.reorder_posts(uuid, uuid[]) to authenticated;
