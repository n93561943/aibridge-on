-- P5-3 보완: 회원 게시판 글 본문을 DB에서도 검사한다.
-- 회원은 RLS로 posts에 직접 쓸 수 있으므로(P5-1), 서버 검증(lib/board/content.ts)을 건너뛰어도
-- 허용하지 않은 블록·링크·남의(외부) 이미지가 저장되지 않게 한다.
--
-- 규칙(서버 규칙과 같게 유지)
-- - 블록: paragraph · bulletListItem · numberedListItem · codeBlock · image
-- - 하위 블록: 목록에만, 최대 4단계
-- - 인라인: text(서식은 bold·code만) · link(http(s)·mailto, 안에는 text만)
-- - 이미지: .../storage/v1/object/public/post-files/board/<본인 id>/... 이고, 본인이 올린 업로드 기록이 있어야 한다.
--   호스트(Supabase 주소)는 DB가 알 수 없으므로 화면에서 사이트 Storage 주소인 경우만 그린다.
-- 관리자·서비스 역할의 쓰기는 검사하지 않는다(is_member_request).

create or replace function public.board_inline_problem(p_content jsonb, p_allow_links boolean)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_item jsonb;
  v_problem text;
begin
  if p_content is null or p_content = 'null'::jsonb then
    return null;
  end if;
  if jsonb_typeof(p_content) <> 'array' then
    return '본문 형식이 올바르지 않습니다.';
  end if;
  for v_item in select value from jsonb_array_elements(p_content) loop
    if jsonb_typeof(v_item) <> 'object' then
      return '본문 형식이 올바르지 않습니다.';
    end if;
    if v_item->>'type' = 'text' then
      if jsonb_typeof(v_item->'text') <> 'string' then
        return '본문 형식이 올바르지 않습니다.';
      end if;
      if v_item ? 'styles' and (
        jsonb_typeof(v_item->'styles') <> 'object'
        or exists (
          select 1 from jsonb_object_keys(v_item->'styles') k where k not in ('bold', 'code')
        )
      ) then
        return '게시판에서 쓸 수 없는 글자 서식이 있습니다.';
      end if;
    elsif v_item->>'type' = 'link' and p_allow_links then
      if coalesce(v_item->>'href', '') !~* '^(https?://|mailto:)' then
        return '링크 주소는 http(s)로 시작해야 합니다.';
      end if;
      v_problem := public.board_inline_problem(v_item->'content', false);
      if v_problem is not null then
        return v_problem;
      end if;
    else
      return '본문 형식이 올바르지 않습니다.';
    end if;
  end loop;
  return null;
end;
$$;

create or replace function public.board_content_problem(
  p_blocks jsonb,
  p_uid uuid,
  p_depth int default 0
)
returns text
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_block jsonb;
  v_type text;
  v_children jsonb;
  v_url text;
  v_path text;
  v_problem text;
begin
  if jsonb_typeof(p_blocks) <> 'array' then
    return '본문 형식이 올바르지 않습니다.';
  end if;
  for v_block in select value from jsonb_array_elements(p_blocks) loop
    if jsonb_typeof(v_block) <> 'object' then
      return '본문 형식이 올바르지 않습니다.';
    end if;
    v_type := v_block->>'type';
    if v_type is null
       or v_type not in ('paragraph', 'bulletListItem', 'numberedListItem', 'codeBlock', 'image') then
      return '게시판에서 쓸 수 없는 블록이 있습니다.';
    end if;

    v_children := coalesce(v_block->'children', '[]'::jsonb);
    if jsonb_typeof(v_children) <> 'array' then
      return '본문 형식이 올바르지 않습니다.';
    end if;
    if jsonb_array_length(v_children) > 0 then
      if v_type not in ('bulletListItem', 'numberedListItem') or p_depth >= 4 then
        return '들여쓰기가 너무 깊습니다.';
      end if;
      v_problem := public.board_content_problem(v_children, p_uid, p_depth + 1);
      if v_problem is not null then
        return v_problem;
      end if;
    end if;

    if v_type = 'image' then
      v_url := v_block->'props'->>'url';
      v_path := substring(v_url from '^https://[^/?#]+/storage/v1/object/public/post-files/(board/[^?#]+)$');
      if v_path is null
         or v_path like '%..%'
         or v_path not like 'board/' || p_uid::text || '/%'
         or not exists (
           select 1 from public.attachments a
           where a.storage_path = v_path and a.uploaded_by = p_uid
         ) then
        return '직접 올린 이미지만 쓸 수 있습니다.';
      end if;
    else
      v_problem := public.board_inline_problem(v_block->'content', v_type <> 'codeBlock');
      if v_problem is not null then
        return v_problem;
      end if;
    end if;
  end loop;
  return null;
end;
$$;

-- 트리거 안에서 회원 권한으로 호출되므로 authenticated는 실행할 수 있어야 한다.
-- security invoker라 업로드 기록은 RLS("본인 업로드 조회") 범위에서만 확인한다.
revoke execute on function public.board_inline_problem(jsonb, boolean) from public, anon;
revoke execute on function public.board_content_problem(jsonb, uuid, int) from public, anon;
grant execute on function public.board_inline_problem(jsonb, boolean) to authenticated;
grant execute on function public.board_content_problem(jsonb, uuid, int) to authenticated;

-- 회원이 본문을 쓰거나 바꿀 때만 검사한다(제목만 고치거나 휴지통으로 보낼 때는 건너뜀).
create or replace function public.check_member_board_content()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_problem text;
begin
  if not public.is_member_request() then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.content is not distinct from old.content then
    return new;
  end if;
  if octet_length(new.content::text) > 200000 then
    raise exception '본문이 너무 깁니다.' using errcode = 'invalid_parameter_value';
  end if;
  v_problem := public.board_content_problem(new.content, auth.uid());
  if v_problem is not null then
    raise exception '%', v_problem using errcode = 'invalid_parameter_value';
  end if;
  return new;
end;
$$;

revoke execute on function public.check_member_board_content() from public, anon, authenticated;

create trigger posts_check_member_content
  before insert or update of content on public.posts
  for each row execute function public.check_member_board_content();
