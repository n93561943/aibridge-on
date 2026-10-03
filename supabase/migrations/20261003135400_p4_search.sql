-- P4 검색(F-10): 제목·본문 평문 부분 일치. 한국어는 기본 전문 검색이 맞지 않아 pg_trgm 색인을 쓴다.
-- content_text에는 교사 전용 박스가 빠져 있으므로(P3) 검색으로 교사 전용 내용이 드러나지 않는다.

create extension if not exists pg_trgm with schema extensions;

create index posts_title_trgm_idx on public.posts
  using gin (title extensions.gin_trgm_ops) where deleted_at is null;
create index posts_content_text_trgm_idx on public.posts
  using gin (content_text extensions.gin_trgm_ops) where deleted_at is null;

-- 검색: 호출자 권한(RLS)으로 실행되므로 공개 글(공개·휴지통 아님·숨김 아님·활성 메뉴)만 나온다.
-- 본문 일치 부분 앞뒤를 잘라 미리보기(snippet)로 돌려준다.
create or replace function public.search_posts(
  p_query text,
  p_menu_id uuid default null,
  p_limit int default 50
)
returns table (
  id uuid,
  menu_id uuid,
  title text,
  slug text,
  lesson_no int,
  summary text,
  snippet text,
  published_at timestamptz,
  title_match boolean
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_query text := btrim(coalesce(p_query, ''));
  v_pattern text;
begin
  if char_length(v_query) < 2 or char_length(v_query) > 50 then
    return;
  end if;
  -- LIKE 특수 문자(\, %, _)는 글자 그대로 찾는다.
  v_pattern := '%' || replace(replace(replace(v_query, '\', '\\'), '%', '\%'), '_', '\_') || '%';

  return query
    select
      p.id, p.menu_id, p.title, p.slug, p.lesson_no, p.summary,
      case
        when strpos(lower(p.content_text), lower(v_query)) > 0 then
          substring(
            p.content_text
            from greatest(strpos(lower(p.content_text), lower(v_query)) - 60, 1)
            for 200
          )
        else left(p.content_text, 160)
      end as snippet,
      p.published_at,
      p.title ilike v_pattern as title_match
    from public.posts p
    where p.deleted_at is null
      and (p_menu_id is null or p.menu_id = p_menu_id)
      and (p.title ilike v_pattern or p.content_text ilike v_pattern)
    order by (p.title ilike v_pattern) desc, p.published_at desc nulls last
    limit least(greatest(coalesce(p_limit, 50), 1), 100);
end;
$$;

grant execute on function public.search_posts(text, uuid, int) to anon, authenticated;
