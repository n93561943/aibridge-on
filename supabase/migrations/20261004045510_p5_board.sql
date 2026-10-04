-- P5 게시판(F-08): comments·votes·reports, 회원 글쓰기 권한, 점수·댓글 수 캐시, 인기 정렬, 도배 방지
--
-- 권한 원칙
-- - 게시판 글쓰기: 메뉴의 글쓰기 등급 이상인 활동 회원(보호자 동의 대기·정지 제외). 작성 즉시 공개.
-- - 회원이 바꿀 수 있는 것은 본인 글·댓글의 내용과 삭제(휴지통)뿐이다. 고정·숨김·점수 등은
--   트리거가 막는다(관리자·서비스 역할·DB 내부 함수는 예외).
-- - 투표는 cast_vote()로만 한다(1인 1표, 0이면 취소).
-- - 도배 방지: 회원당 글 1분 1개, 댓글 10초 1개(관리자 제외). 오류 코드 P0429.

-- ─────────────────────────────────────────────────────────────
-- posts: 게시판 글 제목 300자, 글쓰기 주소 예약어, 인기 정렬 점수
-- ─────────────────────────────────────────────────────────────
alter table public.posts drop constraint posts_title_check;
alter table public.posts
  add constraint posts_title_check check (char_length(btrim(title)) between 1 and 300);

-- /메뉴/submit은 게시판 글쓰기 화면이다.
alter table public.posts add constraint posts_slug_reserved check (slug <> 'submit');

-- 인기 점수(SPEC F-08): log10(max(|score|, 1)) * sign(score) + 작성시각_epoch초 / 45000
-- epoch는 시간대와 무관하므로 immutable로 선언해 생성 컬럼에 쓴다.
create or replace function public.post_hot_rank(p_score int, p_created_at timestamptz)
returns double precision
language sql
immutable
parallel safe
set search_path = ''
as $$
  select log(greatest(abs(p_score), 1)::double precision) * sign(p_score::double precision)
    + extract(epoch from p_created_at)::double precision / 45000;
$$;

alter table public.posts
  add column hot_rank double precision
    generated always as (public.post_hot_rank(score, created_at)) stored;

grant select (hot_rank) on public.posts to anon, authenticated;

create index posts_board_hot_idx on public.posts (menu_id, hot_rank desc, id)
  where deleted_at is null and status = 'published';
create index posts_board_new_idx on public.posts (menu_id, created_at desc, id)
  where deleted_at is null and status = 'published';
create index posts_board_top_idx on public.posts (menu_id, score desc, created_at desc, id)
  where deleted_at is null and status = 'published';
create index posts_author_idx on public.posts (author_id, created_at desc);

-- ─────────────────────────────────────────────────────────────
-- 권한 헬퍼
-- ─────────────────────────────────────────────────────────────
create or replace function public.role_rank(p_role text)
returns int
language sql
immutable
set search_path = ''
as $$
  select case p_role when 'admin' then 3 when 'teacher' then 2 when 'student' then 1 else 0 end;
$$;

-- 이 게시판에 글을 쓸 수 있는가: 활성 board 메뉴 + 활동 회원 + 글쓰기 등급 이상
create or replace function public.can_write_board(p_menu_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.menus m
    where m.id = p_menu_id
      and m.type = 'board'
      and m.is_active
      -- current_user_role()은 활동 회원이 아니면 null → 0
      and public.role_rank(public.current_user_role()) >= public.role_rank(m.board_write_role)
  );
$$;

-- 댓글·투표·신고를 받을 수 있는 게시판 글: 공개 + 휴지통·숨김 아님 + 활성 board 메뉴
create or replace function public.open_board_post_menu(p_post_id uuid)
returns table (allow_comments boolean, allow_votes boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select m.board_allow_comments, m.board_allow_votes
  from public.posts p
  join public.menus m on m.id = p.menu_id
  where p.id = p_post_id
    and p.status = 'published'
    and p.deleted_at is null
    and p.hidden_at is null
    and m.type = 'board'
    and m.is_active;
$$;

create or replace function public.can_comment(p_post_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select o.allow_comments from public.open_board_post_menu(p_post_id) o), false);
$$;

-- ─────────────────────────────────────────────────────────────
-- comments: 게시판 댓글(대댓글 트리, 최대 5단계 = depth 0~4)
-- 삭제는 소프트 삭제이며 본문을 비운다(답글이 있으면 "삭제된 댓글입니다"로 자리만 남김).
-- ─────────────────────────────────────────────────────────────
create table public.comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts (id) on delete cascade,
  parent_id uuid references public.comments (id) on delete cascade,
  depth int not null default 0 check (depth between 0 and 4),
  author_id uuid references public.profiles (id) on delete set null default auth.uid(),
  body text not null check (char_length(body) <= 3000),
  score int not null default 0,
  hidden_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint comments_body_present check (deleted_at is not null or char_length(btrim(body)) >= 1)
);

comment on table public.comments is '게시판 댓글. 삭제하면 본문을 비우고 자리만 남긴다.';

create index comments_post_idx on public.comments (post_id, created_at);
create index comments_parent_idx on public.comments (parent_id);
create index comments_author_idx on public.comments (author_id, created_at desc);

-- 깊이 계산: 부모와 같은 글이어야 하고, 삭제·숨김된 댓글에는 답글을 달 수 없다.
create or replace function public.set_comment_depth()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_parent record;
begin
  if new.parent_id is null then
    new.depth := 0;
    return new;
  end if;

  select c.post_id, c.depth, c.deleted_at, c.hidden_at into v_parent
  from public.comments c where c.id = new.parent_id;

  if not found or v_parent.post_id <> new.post_id then
    raise exception '답글을 달 댓글을 찾을 수 없습니다.' using errcode = 'foreign_key_violation';
  end if;
  if v_parent.deleted_at is not null or v_parent.hidden_at is not null then
    raise exception '삭제되었거나 숨겨진 댓글에는 답글을 달 수 없습니다.' using errcode = 'check_violation';
  end if;
  if v_parent.depth >= 4 then
    raise exception '답글은 5단계까지만 달 수 있습니다.' using errcode = 'check_violation';
  end if;

  new.depth := v_parent.depth + 1;
  return new;
end;
$$;

revoke execute on function public.set_comment_depth() from public, anon, authenticated;

create trigger comments_set_depth
  before insert on public.comments
  for each row execute function public.set_comment_depth();

-- 본문이 바뀔 때만 수정 시각을 갱신한다(점수 변경은 "수정됨"이 아님). 삭제하면 본문을 비운다.
create or replace function public.touch_comment()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.deleted_at is not null and old.deleted_at is null then
    new.body := '';
  elsif new.body is distinct from old.body then
    new.updated_at := now();
  end if;
  return new;
end;
$$;

create trigger comments_touch
  before update on public.comments
  for each row execute function public.touch_comment();

-- 댓글 테이블을 참조하므로 comments 다음에 만든다.
-- 투표·신고 대상이 살아 있는가(댓글은 삭제·숨김 아님 + 소속 글이 열려 있음)
create or replace function public.board_target_post_id(p_target_type text, p_target_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select case p_target_type
    when 'post' then p_target_id
    when 'comment' then (
      select c.post_id from public.comments c
      where c.id = p_target_id and c.deleted_at is null and c.hidden_at is null
    )
  end;
$$;

create or replace function public.can_vote(p_target_type text, p_target_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select o.allow_votes
    from public.open_board_post_menu(public.board_target_post_id(p_target_type, p_target_id)) o
  ), false);
$$;

create or replace function public.can_report(p_target_type text, p_target_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.open_board_post_menu(public.board_target_post_id(p_target_type, p_target_id))
  );
$$;

-- ─────────────────────────────────────────────────────────────
-- votes: 1인 1표(+1/-1). 쓰기는 cast_vote()로만.
-- ─────────────────────────────────────────────────────────────
create table public.votes (
  user_id uuid not null references public.profiles (id) on delete cascade,
  target_type text not null check (target_type in ('post', 'comment')),
  target_id uuid not null,
  value smallint not null check (value in (-1, 1)),
  created_at timestamptz not null default now(),
  primary key (user_id, target_type, target_id)
);

create index votes_target_idx on public.votes (target_type, target_id);

-- ─────────────────────────────────────────────────────────────
-- reports: 신고. 열린 신고는 같은 사람이 같은 대상에 한 번만.
-- ─────────────────────────────────────────────────────────────
create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid references public.profiles (id) on delete set null default auth.uid(),
  target_type text not null check (target_type in ('post', 'comment')),
  target_id uuid not null,
  reason text not null check (reason in ('spam', 'abuse', 'privacy', 'inappropriate', 'other')),
  detail text check (detail is null or char_length(detail) <= 500),
  status text not null default 'open' check (status in ('open', 'resolved')),
  resolution text check (resolution is null or resolution in ('hidden', 'kept')),
  resolved_by uuid references public.profiles (id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),

  constraint reports_resolution_state check (
    (status = 'open' and resolution is null and resolved_at is null)
    or (status = 'resolved' and resolution is not null and resolved_at is not null)
  )
);

create unique index reports_open_once_idx on public.reports (reporter_id, target_type, target_id)
  where status = 'open';
create index reports_status_idx on public.reports (status, created_at desc);
create index reports_target_idx on public.reports (target_type, target_id);

-- ─────────────────────────────────────────────────────────────
-- 캐시 갱신: 점수(votes) · 댓글 수(comments). 동시 투표에도 맞도록 증감으로 갱신한다.
-- ─────────────────────────────────────────────────────────────
create or replace function public.apply_vote_score()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_type text;
  v_id uuid;
  v_delta int;
begin
  if tg_op = 'INSERT' then
    v_type := new.target_type; v_id := new.target_id; v_delta := new.value;
  elsif tg_op = 'DELETE' then
    v_type := old.target_type; v_id := old.target_id; v_delta := -old.value;
  else
    v_type := new.target_type; v_id := new.target_id; v_delta := new.value - old.value;
  end if;

  if v_delta = 0 then
    return null;
  end if;
  if v_type = 'post' then
    update public.posts set score = score + v_delta where id = v_id;
  else
    update public.comments set score = score + v_delta where id = v_id;
  end if;
  return null;
end;
$$;

revoke execute on function public.apply_vote_score() from public, anon, authenticated;

create trigger votes_apply_score
  after insert or update or delete on public.votes
  for each row execute function public.apply_vote_score();

-- 댓글 수 = 삭제·숨김되지 않은 댓글 수
create or replace function public.apply_comment_count()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_delta int := 0;
begin
  if tg_op in ('UPDATE', 'DELETE') and old.deleted_at is null and old.hidden_at is null then
    v_delta := v_delta - 1;
  end if;
  if tg_op in ('INSERT', 'UPDATE') and new.deleted_at is null and new.hidden_at is null then
    v_delta := v_delta + 1;
  end if;
  if v_delta <> 0 then
    update public.posts
    set comment_count = greatest(comment_count + v_delta, 0)
    where id = coalesce(new.post_id, old.post_id);
  end if;
  return null;
end;
$$;

revoke execute on function public.apply_comment_count() from public, anon, authenticated;

create trigger comments_apply_count
  after insert or delete or update of deleted_at, hidden_at on public.comments
  for each row execute function public.apply_comment_count();

-- 글·댓글을 영구 삭제하면 그 대상의 투표·신고도 지운다(대상 FK가 없는 다형 참조라서).
create or replace function public.cleanup_board_target()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_type text := case tg_table_name when 'posts' then 'post' else 'comment' end;
begin
  delete from public.votes where target_type = v_type and target_id = old.id;
  delete from public.reports where target_type = v_type and target_id = old.id;
  return null;
end;
$$;

revoke execute on function public.cleanup_board_target() from public, anon, authenticated;

create trigger posts_cleanup_board_target
  after delete on public.posts
  for each row execute function public.cleanup_board_target();

create trigger comments_cleanup_board_target
  after delete on public.comments
  for each row execute function public.cleanup_board_target();

-- ─────────────────────────────────────────────────────────────
-- 회원 쓰기 보호 트리거
-- 관리자, 서비스 역할, security definer 함수(소유자 권한으로 실행) 안의 변경은 검사하지 않는다.
-- 일반 회원의 직접 요청은 current_user가 authenticated다.
-- ─────────────────────────────────────────────────────────────
create or replace function public.is_member_request()
returns boolean
language sql
stable
set search_path = ''
as $$
  select current_user = 'authenticated' and not public.is_admin();
$$;

-- 게시판 글: 작성 시 관리 항목을 기본값으로 고정, 수정은 제목·본문·삭제만
create or replace function public.guard_member_post_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not public.is_member_request() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    -- 동시에 여러 번 보내도 한 건씩 검사하도록 회원별로 잠근다.
    perform pg_advisory_xact_lock(hashtextextended('board_post:' || auth.uid()::text, 0));
    if exists (
      select 1 from public.posts p
      where p.author_id = auth.uid() and p.created_at > now() - interval '1 minute'
    ) then
      raise exception '글은 1분에 1개만 쓸 수 있습니다. 잠시 후 다시 시도해 주세요.'
        using errcode = 'P0429';
    end if;

    new.author_id := auth.uid();
    new.status := 'published';
    new.published_at := null;  -- posts_set_published_at가 지금 시각으로 채운다
    new.lesson_no := null;
    new.sort_order := 0;
    new.is_pinned := false;
    new.ai_discussion_enabled := false;
    new.score := 0;
    new.comment_count := 0;
    new.hidden_at := null;
    new.deleted_at := null;
    new.draft_title := null;
    new.draft_content := null;
    new.draft_saved_at := null;
    new.created_at := now();
    return new;
  end if;

  -- UPDATE: 제목·본문·요약·대표 이미지와 삭제(휴지통으로)만 허용
  if (to_jsonb(new) - array['title', 'content', 'content_text', 'summary', 'cover_image',
                            'deleted_at', 'updated_at', 'hot_rank'])
     is distinct from
     (to_jsonb(old) - array['title', 'content', 'content_text', 'summary', 'cover_image',
                            'deleted_at', 'updated_at', 'hot_rank']) then
    raise exception '바꿀 수 없는 항목이 포함되어 있습니다.' using errcode = 'insufficient_privilege';
  end if;
  if old.deleted_at is not null then
    raise exception '삭제한 글은 수정할 수 없습니다.' using errcode = 'insufficient_privilege';
  end if;
  if new.deleted_at is not null then
    new.deleted_at := now();
  end if;
  return new;
end;
$$;

create trigger posts_guard_member_write
  before insert or update on public.posts
  for each row execute function public.guard_member_post_write();

-- 댓글: 작성 시 도배 방지·관리 항목 고정, 수정은 본문·삭제만(컬럼 권한과 함께)
create or replace function public.guard_member_comment_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not public.is_member_request() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    perform pg_advisory_xact_lock(hashtextextended('board_comment:' || auth.uid()::text, 0));
    if exists (
      select 1 from public.comments c
      where c.author_id = auth.uid() and c.created_at > now() - interval '10 seconds'
    ) then
      raise exception '댓글은 10초에 1개만 쓸 수 있습니다. 잠시 후 다시 시도해 주세요.'
        using errcode = 'P0429';
    end if;
    new.author_id := auth.uid();
    new.score := 0;
    new.hidden_at := null;
    new.deleted_at := null;
    new.created_at := now();
    new.updated_at := now();
    return new;
  end if;

  if new.hidden_at is distinct from old.hidden_at then
    raise exception '숨김은 관리자만 바꿀 수 있습니다.' using errcode = 'insufficient_privilege';
  end if;
  if new.deleted_at is not null then
    new.deleted_at := now();
  end if;
  return new;
end;
$$;

-- 트리거는 이름순으로 실행된다: guard → set_depth(작성) / guard → touch(수정, 삭제 시각 확정 후 본문 비움).
create trigger comments_guard_member_write
  before insert or update on public.comments
  for each row execute function public.guard_member_comment_write();

-- ─────────────────────────────────────────────────────────────
-- 투표: p_value = 1(추천) / -1(비추천) / 0(취소). 같은 값이면 그대로 둔다.
-- 화면은 "같은 버튼 다시 누르면 취소, 반대 버튼이면 전환"을 원하는 값으로 바꿔 보낸다.
-- ─────────────────────────────────────────────────────────────
create or replace function public.cast_vote(p_target_type text, p_target_id uuid, p_value int)
returns table (score int, my_vote int)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_uid uuid := auth.uid();
  v_score int;
begin
  if v_uid is null or not public.is_active_member() then
    raise exception '투표할 수 없는 계정입니다.' using errcode = 'insufficient_privilege';
  end if;
  if p_target_type is null or p_target_type not in ('post', 'comment')
     or p_value is null or p_value not in (-1, 0, 1) then
    raise exception '잘못된 투표 요청입니다.' using errcode = 'invalid_parameter_value';
  end if;
  if not public.can_vote(p_target_type, p_target_id) then
    raise exception '투표할 수 없는 글이나 댓글입니다.' using errcode = 'P0002';
  end if;

  if p_value = 0 then
    delete from public.votes v
    where v.user_id = v_uid and v.target_type = p_target_type and v.target_id = p_target_id;
  else
    insert into public.votes as v (user_id, target_type, target_id, value)
    values (v_uid, p_target_type, p_target_id, p_value::smallint)
    on conflict (user_id, target_type, target_id)
      do update set value = excluded.value where v.value <> excluded.value;
  end if;

  if p_target_type = 'post' then
    select p.score into v_score from public.posts p where p.id = p_target_id;
  else
    select c.score into v_score from public.comments c where c.id = p_target_id;
  end if;
  return query select v_score, p_value;
end;
$$;

revoke execute on function public.cast_vote(text, uuid, int) from public, anon;
grant execute on function public.cast_vote(text, uuid, int) to authenticated;

-- ─────────────────────────────────────────────────────────────
-- 신고 처리(관리자): 숨김 또는 유지. 같은 대상의 열린 신고를 모두 처리한다.
-- ─────────────────────────────────────────────────────────────
create or replace function public.resolve_report(p_report_id uuid, p_action text)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_report record;
begin
  if not (select public.is_admin()) then
    raise exception '관리자만 신고를 처리할 수 있습니다.' using errcode = 'insufficient_privilege';
  end if;
  if p_action is null or p_action not in ('hidden', 'kept') then
    raise exception '처리 방법은 숨김 또는 유지입니다.' using errcode = 'invalid_parameter_value';
  end if;

  select r.target_type, r.target_id into v_report
  from public.reports r where r.id = p_report_id
  for update;
  if not found then
    raise exception '신고를 찾을 수 없습니다.' using errcode = 'P0002';
  end if;

  if p_action = 'hidden' then
    if v_report.target_type = 'post' then
      update public.posts set hidden_at = coalesce(hidden_at, now()) where id = v_report.target_id;
    else
      update public.comments set hidden_at = coalesce(hidden_at, now()) where id = v_report.target_id;
    end if;
  end if;

  update public.reports
  set status = 'resolved', resolution = p_action, resolved_by = auth.uid(), resolved_at = now()
  where target_type = v_report.target_type
    and target_id = v_report.target_id
    and status = 'open';
end;
$$;

revoke execute on function public.resolve_report(uuid, text) from public, anon;
grant execute on function public.resolve_report(uuid, text) to authenticated;

-- 헬퍼 함수 실행 권한: RLS 정책에서 쓰므로 로그인 사용자만
revoke execute on function public.can_write_board(uuid) from public, anon;
revoke execute on function public.open_board_post_menu(uuid) from public, anon, authenticated;
revoke execute on function public.can_comment(uuid) from public, anon;
revoke execute on function public.board_target_post_id(text, uuid) from public, anon, authenticated;
revoke execute on function public.can_vote(text, uuid) from public, anon;
revoke execute on function public.can_report(text, uuid) from public, anon;
revoke execute on function public.is_member_request() from public, anon;
grant execute on function public.can_write_board(uuid) to authenticated;
grant execute on function public.can_comment(uuid) to authenticated;
grant execute on function public.can_vote(text, uuid) to authenticated;
grant execute on function public.can_report(text, uuid) to authenticated;
grant execute on function public.is_member_request() to authenticated;

-- ─────────────────────────────────────────────────────────────
-- RLS: posts(게시판 회원 글)
-- ─────────────────────────────────────────────────────────────
-- 본인 글은 휴지통·숨김 상태여도 본다(내 글 목록, 삭제 후 행 확인).
create policy "본인 게시물 조회" on public.posts
  for select to authenticated
  using (author_id = (select auth.uid()));

create policy "게시판 글 작성" on public.posts
  for insert to authenticated
  with check (author_id = (select auth.uid()) and public.can_write_board(menu_id));

-- 휴지통·숨김 글은 작성자가 고칠 수 없다(신고 증거 보존).
create policy "게시판 글 수정(작성자)" on public.posts
  for update to authenticated
  using (
    author_id = (select auth.uid())
    and deleted_at is null
    and hidden_at is null
    and (select public.is_active_member())
    and exists (select 1 from public.menus m where m.id = menu_id and m.type = 'board')
  )
  with check (author_id = (select auth.uid()));

-- ─────────────────────────────────────────────────────────────
-- RLS: comments
-- ─────────────────────────────────────────────────────────────
alter table public.comments enable row level security;

revoke all on public.comments from anon, authenticated;
grant select on public.comments to anon, authenticated;
grant insert (post_id, parent_id, body) on public.comments to authenticated;
grant update (body, deleted_at, hidden_at) on public.comments to authenticated;
grant delete on public.comments to authenticated;

-- 볼 수 있는 글(posts RLS)의 숨기지 않은 댓글. 삭제된 댓글은 본문이 비어 있다.
create policy "공개 댓글 조회" on public.comments
  for select to anon, authenticated
  using (hidden_at is null and exists (select 1 from public.posts p where p.id = post_id));

create policy "본인 댓글 조회" on public.comments
  for select to authenticated
  using (author_id = (select auth.uid()));

create policy "관리자 전체 댓글 조회" on public.comments
  for select to authenticated
  using ((select public.is_admin()));

create policy "댓글 작성" on public.comments
  for insert to authenticated
  with check (
    author_id = (select auth.uid())
    and (select public.is_active_member())
    and public.can_comment(post_id)
  );

create policy "댓글 수정(작성자)" on public.comments
  for update to authenticated
  using (
    author_id = (select auth.uid())
    and deleted_at is null
    and hidden_at is null
    and (select public.is_active_member())
  )
  with check (author_id = (select auth.uid()));

create policy "관리자 댓글 수정" on public.comments
  for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

create policy "관리자 댓글 삭제" on public.comments
  for delete to authenticated
  using ((select public.is_admin()));

-- ─────────────────────────────────────────────────────────────
-- RLS: votes(본인 투표만 조회, 쓰기는 cast_vote)
-- ─────────────────────────────────────────────────────────────
alter table public.votes enable row level security;

revoke all on public.votes from anon, authenticated;
grant select on public.votes to authenticated;

create policy "본인 투표 조회" on public.votes
  for select to authenticated
  using (user_id = (select auth.uid()));

-- ─────────────────────────────────────────────────────────────
-- RLS: reports
-- ─────────────────────────────────────────────────────────────
alter table public.reports enable row level security;

revoke all on public.reports from anon, authenticated;
grant select on public.reports to authenticated;
grant insert (target_type, target_id, reason, detail) on public.reports to authenticated;
grant update (status, resolution, resolved_by, resolved_at) on public.reports to authenticated;
grant delete on public.reports to authenticated;

create policy "본인 신고 조회" on public.reports
  for select to authenticated
  using (reporter_id = (select auth.uid()));

create policy "관리자 신고 조회" on public.reports
  for select to authenticated
  using ((select public.is_admin()));

create policy "신고 작성" on public.reports
  for insert to authenticated
  with check (
    reporter_id = (select auth.uid())
    and (select public.is_active_member())
    and public.can_report(target_type, target_id)
  );

create policy "관리자 신고 처리" on public.reports
  for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

create policy "관리자 신고 삭제" on public.reports
  for delete to authenticated
  using ((select public.is_admin()));
