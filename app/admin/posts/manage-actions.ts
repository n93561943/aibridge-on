"use server";

import { randomUUID } from "node:crypto";

import { revalidatePath, revalidateTag } from "next/cache";
import { z } from "zod";

import { requireAdmin } from "@/lib/auth/current-user";
import { POST_FILES_BUCKET, storageSafeName } from "@/lib/posts/constants";
import { type Block, extractPlainText } from "@/lib/posts/content";
import { deletePostsWithFiles } from "@/lib/posts/purge";
import { pickUniqueSlug } from "@/lib/posts/slug";
import { POSTS_CACHE_TAG } from "@/lib/posts/public";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/types/database";

export type ManageResult = { ok: boolean; message: string };

const idsSchema = z.array(z.uuid()).min(1, "게시물을 선택해 주세요.").max(200);
type Supabase = Awaited<ReturnType<typeof createClient>>;

/** 게시물 목록·휴지통·공개 화면 캐시를 지운다. */
function revalidatePosts() {
  revalidatePath("/admin/posts");
  revalidatePath("/admin/trash");
  revalidateTag(POSTS_CACHE_TAG);
  revalidatePath("/", "layout");
}

async function slugsIn(supabase: Supabase, menuId: string): Promise<Set<string>> {
  const { data } = await supabase.from("posts").select("slug").eq("menu_id", menuId);
  return new Set((data ?? []).map((p) => p.slug));
}

async function lastSortOrder(supabase: Supabase, menuId: string): Promise<number> {
  const { data } = await supabase
    .from("posts")
    .select("sort_order")
    .eq("menu_id", menuId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.sort_order ?? 0;
}

/** 게시물을 받을 수 있는 메뉴(게시글·게시판)인지 확인 */
async function loadTargetMenu(supabase: Supabase, menuId: string) {
  const { data } = await supabase
    .from("menus")
    .select("id, title, type")
    .eq("id", menuId)
    .maybeSingle();
  return data && (data.type === "series" || data.type === "board") ? data : null;
}

/**
 * 게시물들을 다른 메뉴로 옮긴다(D10). 주소가 겹치면 -2 등을 붙이고, 대상 메뉴의 맨 뒤에 둔다.
 * 휴지통 글을 메뉴와 함께 복구할 때도 쓴다(restore).
 */
async function moveInto(
  supabase: Supabase,
  ids: string[],
  targetMenuId: string,
  extra: { deleted_at?: null } = {},
): Promise<boolean> {
  const { data: posts } = await supabase
    .from("posts")
    .select("id, slug, menu_id, sort_order")
    .in("id", ids)
    .order("sort_order");
  if (!posts?.length) return false;

  const taken = await slugsIn(supabase, targetMenuId);
  let order = await lastSortOrder(supabase, targetMenuId);
  for (const post of posts) {
    if (post.menu_id === targetMenuId) {
      if (extra.deleted_at === null) {
        const { error } = await supabase.from("posts").update(extra).eq("id", post.id);
        if (error) return false;
      }
      continue;
    }
    const slug = pickUniqueSlug(post.slug, taken);
    taken.add(slug);
    order += 1;
    const { error } = await supabase
      .from("posts")
      .update({ menu_id: targetMenuId, slug, sort_order: order, ...extra })
      .eq("id", post.id);
    if (error) return false;
  }
  return true;
}

export async function movePosts(ids: string[], targetMenuId: string): Promise<ManageResult> {
  await requireAdmin();
  const parsed = idsSchema.safeParse(ids);
  if (!parsed.success || !z.uuid().safeParse(targetMenuId).success) {
    return { ok: false, message: "잘못된 요청입니다." };
  }
  const supabase = await createClient();
  const menu = await loadTargetMenu(supabase, targetMenuId);
  if (!menu) return { ok: false, message: "옮길 메뉴를 찾을 수 없습니다." };

  if (!(await moveInto(supabase, parsed.data, menu.id))) {
    return { ok: false, message: "옮기지 못했습니다. 잠시 후 다시 시도해 주세요." };
  }
  revalidatePosts();
  return {
    ok: true,
    message: `게시물 ${parsed.data.length}개를 '${menu.title}'(으)로 옮겼습니다.`,
  };
}

export async function trashPosts(ids: string[]): Promise<ManageResult> {
  await requireAdmin();
  const parsed = idsSchema.safeParse(ids);
  if (!parsed.success) return { ok: false, message: "게시물을 선택해 주세요." };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("posts")
    .update({ deleted_at: new Date().toISOString() })
    .in("id", parsed.data)
    .is("deleted_at", null)
    .select("id");
  if (error) return { ok: false, message: "휴지통으로 보내지 못했습니다." };
  revalidatePosts();
  return {
    ok: true,
    message: `게시물 ${data.length}개를 휴지통으로 보냈습니다. 30일 뒤 영구 삭제됩니다.`,
  };
}

/**
 * 휴지통에서 복구. 메뉴가 삭제된 글(menu_id 없음)은 targetMenuId로 복구한다.
 */
export async function restorePosts(ids: string[], targetMenuId?: string): Promise<ManageResult> {
  await requireAdmin();
  const parsed = idsSchema.safeParse(ids);
  if (!parsed.success) return { ok: false, message: "게시물을 선택해 주세요." };
  const supabase = await createClient();

  const { data: posts } = await supabase
    .from("posts")
    .select("id, menu_id")
    .in("id", parsed.data)
    .not("deleted_at", "is", null);
  if (!posts?.length) return { ok: false, message: "복구할 게시물을 찾을 수 없습니다." };

  const orphans = posts.filter((p) => p.menu_id === null).map((p) => p.id);
  const withMenu = posts.filter((p) => p.menu_id !== null).map((p) => p.id);

  if (orphans.length) {
    if (!targetMenuId || !z.uuid().safeParse(targetMenuId).success) {
      return { ok: false, message: "메뉴가 삭제된 게시물이 있습니다. 복구할 메뉴를 골라 주세요." };
    }
    const menu = await loadTargetMenu(supabase, targetMenuId);
    if (!menu) return { ok: false, message: "복구할 메뉴를 찾을 수 없습니다." };
    if (!(await moveInto(supabase, orphans, menu.id, { deleted_at: null }))) {
      return { ok: false, message: "복구하지 못했습니다." };
    }
  }
  if (withMenu.length) {
    const { error } = await supabase.from("posts").update({ deleted_at: null }).in("id", withMenu);
    if (error) return { ok: false, message: "복구하지 못했습니다." };
  }
  revalidatePosts();
  return {
    ok: true,
    message: `게시물 ${posts.length}개를 복구했습니다. 공개 상태는 그대로입니다.`,
  };
}

/** 휴지통에 있는 게시물만 바로 영구 삭제(파일 포함). 되돌릴 수 없다. */
export async function deletePostsForever(ids: string[]): Promise<ManageResult> {
  await requireAdmin();
  const parsed = idsSchema.safeParse(ids);
  if (!parsed.success) return { ok: false, message: "게시물을 선택해 주세요." };
  const supabase = await createClient();
  // 사용자 세션(RLS)으로 휴지통 글인지 확인한 뒤, 파일 삭제를 위해 service role로 지운다.
  const { data: trashed } = await supabase
    .from("posts")
    .select("id")
    .in("id", parsed.data)
    .not("deleted_at", "is", null);
  const targetIds = (trashed ?? []).map((p) => p.id);
  if (!targetIds.length)
    return { ok: false, message: "휴지통에 있는 게시물만 영구 삭제할 수 있습니다." };

  try {
    await deletePostsWithFiles(createAdminClient(), targetIds);
  } catch (error) {
    console.error(error);
    return { ok: false, message: "영구 삭제하지 못했습니다. 잠시 후 다시 시도해 주세요." };
  }
  revalidatePosts();
  return { ok: true, message: `게시물 ${targetIds.length}개를 영구 삭제했습니다.` };
}

/**
 * 게시물 복제: 초안으로 같은 메뉴 맨 뒤에 만든다. 첨부 파일도 새 경로로 복사해
 * 원본이 지워져도 사본의 이미지가 깨지지 않게 한다.
 */
export async function duplicatePost(id: string): Promise<ManageResult & { id?: string }> {
  const admin = await requireAdmin();
  if (!z.uuid().safeParse(id).success) return { ok: false, message: "잘못된 요청입니다." };
  const supabase = await createClient();

  const [{ data: source }, { data: rows }] = await Promise.all([
    supabase
      .from("posts")
      .select("title, slug, menu_id, lesson_no, summary, deleted_at")
      .eq("id", id)
      .maybeSingle(),
    supabase.rpc("get_post_editor_content", { p_post_id: id }),
  ]);
  const body = rows?.[0];
  if (!source || !body || !source.menu_id || source.deleted_at) {
    return { ok: false, message: "복제할 게시물을 찾을 수 없습니다." };
  }

  const title = `${(body.draft_title ?? source.title).slice(0, 195)} (사본)`;
  const slug = pickUniqueSlug(
    `${source.slug.slice(0, 45)}-copy`,
    await slugsIn(supabase, source.menu_id),
  );
  const { data: copy, error } = await supabase
    .from("posts")
    .insert({
      menu_id: source.menu_id,
      title,
      slug,
      lesson_no: source.lesson_no,
      summary: source.summary,
      sort_order: (await lastSortOrder(supabase, source.menu_id)) + 1,
      author_id: admin.id,
    })
    .select("id")
    .single();
  if (error || !copy) return { ok: false, message: "복제하지 못했습니다." };

  // 첨부 파일 복사 후 본문의 파일 주소를 새 경로로 바꾼다.
  let contentJson = JSON.stringify(body.draft_content ?? body.content ?? []);
  const { data: files } = await supabase
    .from("attachments")
    .select("storage_path, file_name, mime_type, size_bytes")
    .eq("post_id", id);
  const storage = createAdminClient().storage.from(POST_FILES_BUCKET);
  for (const file of files ?? []) {
    const newPath = `${copy.id}/${randomUUID()}-${storageSafeName(file.file_name)}`;
    const { error: copyError } = await storage.copy(file.storage_path, newPath);
    if (copyError) continue; // 복사 실패 시 원본 주소를 그대로 쓴다(원본 삭제 전까지는 보인다).
    await supabase.from("attachments").insert({ ...file, post_id: copy.id, storage_path: newPath });
    contentJson = contentJson
      .split(`/${POST_FILES_BUCKET}/${file.storage_path}`)
      .join(`/${POST_FILES_BUCKET}/${newPath}`);
  }
  const content = JSON.parse(contentJson) as Block[];
  await supabase
    .from("posts")
    .update({ content: content as unknown as Json, content_text: extractPlainText(content) })
    .eq("id", copy.id);

  revalidatePosts();
  return { ok: true, message: `'${title}'을(를) 만들었습니다.`, id: copy.id };
}

/** 한 메뉴 안의 차시 순서 변경 */
export async function reorderPosts(menuId: string, ids: string[]): Promise<ManageResult> {
  await requireAdmin();
  if (!z.uuid().safeParse(menuId).success || !idsSchema.safeParse(ids).success) {
    return { ok: false, message: "잘못된 요청입니다." };
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("reorder_posts", { p_menu_id: menuId, p_ids: ids });
  if (error) {
    return {
      ok: false,
      message: /[가-힣]/.test(error.message) ? error.message : "순서를 바꾸지 못했습니다.",
    };
  }
  revalidatePosts();
  return { ok: true, message: "순서를 바꿨습니다." };
}
