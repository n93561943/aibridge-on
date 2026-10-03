-- P3 게시물: posts, post_revisions, attachments, 파일 버킷, 휴지통 자동 삭제 대상 조회
--
-- 본문 보호(교사 전용 박스, 결정 1): 비회원·회원은 posts의 본문 컬럼(content, draft_*)을
-- 직접 읽을 수 없다(컬럼 권한). 관리자는 get_post_editor_content()로, 공개 화면은 서버가
-- 교사 전용 블록을 뺀 뒤 내려준다(P4).
--
-- 공개된 글의 자동 저장(결정 2-a): 공개 글을 고치면 draft_title·draft_content에만 저장하고,
-- "변경 사항 공개" 때 title·content로 옮긴다. 초안 글은 title·content에 바로 저장한다.

-- ─────────────────────────────────────────────────────────────
-- posts: series 문서와 board 글을 함께 저장
-- ─────────────────────────────────────────────────────────────
create table public.posts (
  id uuid primary key default gen_random_uuid(),
  -- 메뉴를 지우면 null(휴지통 글만 허용). 복구할 때 메뉴를 다시 고른다.
  menu_id uuid references public.menus (id) on delete set null,
  title text not null check (char_length(btrim(title)) between 1 and 200),
  slug text not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 80),
  lesson_no int check (lesson_no is null or lesson_no between 0 and 999),
  sort_order int not null default 0,
  content jsonb not null default '[]'::jsonb check (jsonb_typeof(content) = 'array'),
  content_text text not null default '',   -- 검색·미리보기용 평문(교사 전용 박스 제외)
  summary text check (summary is null or char_length(summary) <= 300),
  cover_image text,
  status text not null default 'draft' check (status in ('draft', 'published')),
  published_at timestamptz,
  -- 공개 글의 저장 전 수정본(결정 2-a). null이면 공개본과 같다.
  draft_title text check (draft_title is null or char_length(btrim(draft_title)) between 1 and 200),
  draft_content jsonb check (draft_content is null or jsonb_typeof(draft_content) = 'array'),
  draft_saved_at timestamptz,
  is_pinned boolean not null default false,
  ai_discussion_enabled boolean not null default false,
  score int not null default 0,
  comment_count int not null default 0,
  hidden_at timestamptz,
  author_id uuid references public.profiles (id) on delete set null,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint posts_menu_or_trashed check (menu_id is not null or deleted_at is not null),
  constraint posts_draft_only_when_published check (
    status = 'published' or (draft_title is null and draft_content is null)
  )
);

comment on table public.posts is 'series 문서·board 글. 본문 컬럼은 관리자 RPC와 서버만 읽는다.';
comment on column public.posts.draft_content is '공개 글의 미공개 수정본(자동 저장). 변경 사항 공개 시 content로 옮긴다.';

create unique index posts_menu_slug_key on public.posts (menu_id, slug);
create index posts_menu_list_idx on public.posts (menu_id, sort_order) where deleted_at is null;
create index posts_trash_idx on public.posts (deleted_at) where deleted_at is not null;

create trigger posts_set_updated_at
  before update on public.posts
  for each row execute function public.set_updated_at();

-- 처음 공개될 때 공개 시각 기록
create or replace function public.set_post_published_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'published' and new.published_at is null then
    new.published_at = now();
  end if;
  return new;
end;
$$;

create trigger posts_set_published_at
  before insert or update of status on public.posts
  for each row execute function public.set_post_published_at();

-- ─────────────────────────────────────────────────────────────
-- post_revisions: 저장 이력(게시물당 최근 20개)
-- ─────────────────────────────────────────────────────────────
create table public.post_revisions (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts (id) on delete cascade,
  title text not null,
  content jsonb not null check (jsonb_typeof(content) = 'array'),
  editor_id uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create index post_revisions_post_idx on public.post_revisions (post_id, created_at desc);

create or replace function public.trim_post_revisions()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.post_revisions r
  where r.post_id = new.post_id
    and r.id not in (
      select id from public.post_revisions
      where post_id = new.post_id
      order by created_at desc, id desc
      limit 20
    );
  return null;
end;
$$;

revoke execute on function public.trim_post_revisions() from public, anon, authenticated;

create trigger post_revisions_trim
  after insert on public.post_revisions
  for each row execute function public.trim_post_revisions();

-- ─────────────────────────────────────────────────────────────
-- attachments: 업로드 파일 기록(Storage 버킷 post-files). 영구 삭제 때 파일도 지운다.
-- ─────────────────────────────────────────────────────────────
create table public.attachments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts (id) on delete cascade,
  storage_path text not null unique,
  file_name text not null check (char_length(file_name) between 1 and 255),
  mime_type text not null,
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 52428800),
  created_at timestamptz not null default now()
);

create index attachments_post_idx on public.attachments (post_id);

-- ─────────────────────────────────────────────────────────────
-- 관리자 에디터용 본문 조회(본문 컬럼은 일반 권한으로 읽을 수 없으므로)
-- ─────────────────────────────────────────────────────────────
create or replace function public.get_post_editor_content(p_post_id uuid)
returns table (content jsonb, draft_title text, draft_content jsonb)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception '관리자만 본문을 불러올 수 있습니다.' using errcode = 'insufficient_privilege';
  end if;
  return query
    select p.content, p.draft_title, p.draft_content from public.posts p where p.id = p_post_id;
end;
$$;

revoke execute on function public.get_post_editor_content(uuid) from public, anon;
grant execute on function public.get_post_editor_content(uuid) to authenticated;

-- ─────────────────────────────────────────────────────────────
-- RLS
-- ─────────────────────────────────────────────────────────────
alter table public.posts enable row level security;
alter table public.post_revisions enable row level security;
alter table public.attachments enable row level security;

-- posts: 본문 컬럼을 뺀 나머지만 조회 권한. 쓰기는 관리자만(RLS).
revoke all on public.posts from anon, authenticated;
grant select (
  id, menu_id, title, slug, lesson_no, sort_order, content_text, summary, cover_image, status,
  published_at, draft_saved_at, is_pinned, ai_discussion_enabled, score, comment_count, hidden_at,
  author_id, deleted_at, created_at, updated_at
) on public.posts to anon, authenticated;
grant insert, update, delete on public.posts to authenticated;

-- 공개 글: 공개 상태 + 휴지통·숨김 아님 + 활성 메뉴
create policy "공개 게시물 조회" on public.posts
  for select to anon, authenticated
  using (
    status = 'published'
    and deleted_at is null
    and hidden_at is null
    and exists (select 1 from public.menus m where m.id = menu_id and m.is_active)
  );

create policy "관리자 전체 게시물 조회" on public.posts
  for select to authenticated
  using ((select public.is_admin()));

create policy "관리자 게시물 추가" on public.posts
  for insert to authenticated
  with check ((select public.is_admin()));

create policy "관리자 게시물 수정" on public.posts
  for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

create policy "관리자 게시물 삭제" on public.posts
  for delete to authenticated
  using ((select public.is_admin()));

-- post_revisions·attachments: 관리자만
revoke all on public.post_revisions from anon, authenticated;
revoke all on public.attachments from anon, authenticated;
grant select, insert, delete on public.post_revisions to authenticated;
grant select, insert, delete on public.attachments to authenticated;

create policy "관리자 이력 관리" on public.post_revisions
  for all to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

create policy "관리자 첨부 관리" on public.attachments
  for all to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

-- ─────────────────────────────────────────────────────────────
-- Storage: post-files 버킷(공개 읽기). 업로드는 서버가 관리자 확인 후 발급한
-- 서명 URL로만 한다(사용자용 업로드 정책 없음). SVG·HTML은 허용하지 않는다(스크립트 실행 방지).
-- 이미지 10MB는 서버가 업로드 확인 때 검사하고, 버킷은 파일 최대 50MB로 막는다.
-- ─────────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'post-files',
  'post-files',
  true,
  52428800,
  array[
    'image/png', 'image/jpeg', 'image/gif', 'image/webp',
    'application/pdf', 'application/zip', 'application/x-zip-compressed',
    'text/plain', 'text/csv', 'text/x-python', 'application/x-ipynb+json', 'application/json',
    'application/x-hwp', 'application/haansofthwp', 'application/vnd.hancom.hwp',
    'application/vnd.hancom.hwpx', 'application/hwp+zip',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/octet-stream'
  ]
)
on conflict (id) do nothing;
