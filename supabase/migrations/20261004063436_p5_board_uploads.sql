-- P5-3 게시판 글쓰기: 회원 이미지 업로드 기록, 하루 업로드 한도, 글 저장 함수
--
-- 흐름
-- 1. 서버가 글쓰기 권한을 확인하고 서명 업로드 URL을 발급한다(경로 board/<회원id>/...).
-- 2. 업로드가 끝나면 서버가 실제 파일을 다시 검사하고 회원 세션으로 attachments에 기록한다.
--    이때는 아직 글이 없으므로 post_id가 비어 있다(uploaded_by = 올린 사람).
-- 3. 글을 저장하면 create_board_post/update_board_post가 본문에 쓰인 본인 업로드만 그 글에 연결한다.
-- 4. 24시간이 지나도 글에 연결되지 않은 업로드는 Cron(/api/cron/purge-trash)이 파일과 함께 지운다.

-- ─────────────────────────────────────────────────────────────
-- attachments: 글 전 업로드
-- ─────────────────────────────────────────────────────────────
alter table public.attachments alter column post_id drop not null;
alter table public.attachments
  add column uploaded_by uuid references public.profiles (id) on delete set null;

create index attachments_uploader_idx on public.attachments (uploaded_by, created_at desc);
create index attachments_unlinked_idx on public.attachments (created_at) where post_id is null;

-- ─────────────────────────────────────────────────────────────
-- site_settings: 회원 하루 업로드 한도(기본 30장). 관리자가 /admin/settings에서 바꾼다.
-- ─────────────────────────────────────────────────────────────
alter table public.site_settings add constraint site_settings_board_upload_daily_limit check (
  key <> 'board_upload_daily_limit'
  or (jsonb_typeof(value) = 'number' and (value #>> '{}')::numeric between 0 and 1000
      and (value #>> '{}')::numeric = floor((value #>> '{}')::numeric))
);

insert into public.site_settings (key, value)
values ('board_upload_daily_limit', '30'::jsonb)
on conflict (key) do nothing;

-- 설정이 지워졌으면 0(업로드 막음)이 아니라 마이그레이션 기본값과 같은 30으로 본다.
create or replace function public.board_upload_daily_limit()
returns int
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select (s.value #>> '{}')::int from public.site_settings s
     where s.key = 'board_upload_daily_limit' and jsonb_typeof(s.value) = 'number'),
    30
  );
$$;

revoke execute on function public.board_upload_daily_limit() from public, anon;
grant execute on function public.board_upload_daily_limit() to authenticated;

-- ─────────────────────────────────────────────────────────────
-- 회원 업로드 기록 검사(관리자·서비스 역할은 예외)
-- - 기록: 활동 회원, 본인 경로(board/<본인 id>/), 글 연결 없이, 최근 24시간 한도 이내
-- - 수정: 글 연결(post_id)만, 비어 있던 것을 본인 글로
-- ─────────────────────────────────────────────────────────────
create or replace function public.guard_member_attachment_write()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if not public.is_member_request() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if not public.is_active_member() then
      raise exception '업로드할 수 없는 계정입니다.' using errcode = 'insufficient_privilege';
    end if;
    if new.storage_path not like 'board/' || v_uid::text || '/%' then
      raise exception '업로드 경로가 올바르지 않습니다.' using errcode = 'insufficient_privilege';
    end if;
    -- 동시에 여러 장을 올려도 한도를 넘지 않게 회원별로 잠근다.
    perform pg_advisory_xact_lock(hashtextextended('board_upload:' || v_uid::text, 0));
    if (
      select count(*) from public.attachments a
      where a.uploaded_by = v_uid and a.created_at > now() - interval '24 hours'
    ) >= public.board_upload_daily_limit() then
      raise exception '오늘 올릴 수 있는 이미지 수를 넘었습니다. 내일 다시 시도해 주세요.'
        using errcode = 'P0429';
    end if;
    new.uploaded_by := v_uid;
    new.post_id := null;
    new.created_at := now();
    return new;
  end if;

  -- UPDATE: 글 연결만
  if (to_jsonb(new) - 'post_id') is distinct from (to_jsonb(old) - 'post_id')
     or old.post_id is not null then
    raise exception '바꿀 수 없는 항목입니다.' using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;

create trigger attachments_guard_member_write
  before insert or update on public.attachments
  for each row execute function public.guard_member_attachment_write();

-- ─────────────────────────────────────────────────────────────
-- RLS: attachments(회원). 관리자 정책("관리자 첨부 관리")은 그대로.
-- ─────────────────────────────────────────────────────────────
grant update (post_id) on public.attachments to authenticated;

create policy "본인 업로드 조회" on public.attachments
  for select to authenticated
  using (uploaded_by = (select auth.uid()));

create policy "본인 업로드 기록" on public.attachments
  for insert to authenticated
  with check (
    uploaded_by = (select auth.uid())
    and post_id is null
    and (select public.is_active_member())
  );

create policy "본인 업로드 글에 연결" on public.attachments
  for update to authenticated
  using (uploaded_by = (select auth.uid()) and post_id is null)
  with check (
    uploaded_by = (select auth.uid())
    and exists (
      select 1 from public.posts p
      where p.id = post_id and p.author_id = (select auth.uid()) and p.deleted_at is null
    )
  );

-- ─────────────────────────────────────────────────────────────
-- 글 저장: 글 쓰기·고치기와 업로드 연결을 한 트랜잭션으로(연결 전에 정리되는 일이 없게).
-- security invoker라 posts·attachments의 RLS와 트리거(권한·1분 제한·관리 항목 고정)를 그대로 거친다.
-- ─────────────────────────────────────────────────────────────
create or replace function public.create_board_post(
  p_menu_id uuid,
  p_slug text,
  p_title text,
  p_content jsonb,
  p_content_text text,
  p_upload_paths text[]
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if not exists (select 1 from public.menus m where m.id = p_menu_id and m.type = 'board') then
    raise exception '게시판이 아닙니다.' using errcode = 'P0002';
  end if;

  insert into public.posts (menu_id, slug, title, content, content_text, status, author_id)
  values (p_menu_id, p_slug, p_title, p_content, p_content_text, 'published', auth.uid())
  returning id into v_id;

  update public.attachments a
  set post_id = v_id
  where a.uploaded_by = auth.uid()
    and a.post_id is null
    and a.storage_path = any (coalesce(p_upload_paths, '{}'));

  return v_id;
end;
$$;

create or replace function public.update_board_post(
  p_post_id uuid,
  p_title text,
  p_content jsonb,
  p_content_text text,
  p_upload_paths text[]
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  update public.posts p
  set title = p_title, content = p_content, content_text = p_content_text
  where p.id = p_post_id
    and p.author_id = auth.uid()
    and p.deleted_at is null
    and exists (select 1 from public.menus m where m.id = p.menu_id and m.type = 'board');
  if not found then
    raise exception '고칠 수 없는 글입니다.' using errcode = 'P0002';
  end if;

  update public.attachments a
  set post_id = p_post_id
  where a.uploaded_by = auth.uid()
    and a.post_id is null
    and a.storage_path = any (coalesce(p_upload_paths, '{}'));
end;
$$;

revoke execute on function public.create_board_post(uuid, text, text, jsonb, text, text[])
  from public, anon;
grant execute on function public.create_board_post(uuid, text, text, jsonb, text, text[])
  to authenticated;
revoke execute on function public.update_board_post(uuid, text, jsonb, text, text[])
  from public, anon;
grant execute on function public.update_board_post(uuid, text, jsonb, text, text[])
  to authenticated;
