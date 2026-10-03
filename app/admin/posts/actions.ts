"use server";

import { randomUUID } from "node:crypto";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireAdmin } from "@/lib/auth/current-user";
import { menuSlugSchema } from "@/lib/menus/schema";
import {
  POST_FILES_BUCKET,
  resolveMimeType,
  storageSafeName,
  uploadError,
} from "@/lib/posts/constants";
import {
  type Block,
  extractPlainText,
  postContentSchema,
  postTitleSchema,
} from "@/lib/posts/content";
import { newPostSlug, REVISION_INTERVAL_MS } from "@/lib/posts/editor";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/types/database";

export type ActionResult<T = object> = ({ ok: true } & T) | { ok: false; message: string };

const idSchema = z.uuid();
const editorPath = (id: string) => `/admin/posts/${id}`;
const FAIL = "저장하지 못했습니다. 잠시 후 다시 시도해 주세요.";

type Supabase = Awaited<ReturnType<typeof createClient>>;

/** 검증을 마친 블록 JSON을 DB jsonb 타입으로 */
const json = (blocks: Block[]) => blocks as unknown as Json;

/** 이력 저장. force가 아니면 마지막 이력이 10분 넘었을 때만 남긴다. */
async function addRevision(
  supabase: Supabase,
  postId: string,
  editorId: string,
  title: string,
  content: Block[],
  force: boolean,
) {
  if (!force) {
    const { data: last } = await supabase
      .from("post_revisions")
      .select("created_at")
      .eq("post_id", postId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (last && Date.now() - new Date(last.created_at).getTime() < REVISION_INTERVAL_MS) return;
  }
  await supabase
    .from("post_revisions")
    .insert({ post_id: postId, title, content: json(content), editor_id: editorId });
}

async function loadStatus(supabase: Supabase, id: string) {
  const { data } = await supabase
    .from("posts")
    .select("id, status, deleted_at")
    .eq("id", id)
    .maybeSingle();
  return data;
}

// ─────────────────────────────────────────────────────────────
// 새 게시물: 메뉴·제목만 받아 초안을 만들고 에디터로 보낸다.
// ─────────────────────────────────────────────────────────────
export type CreatePostState = { message?: string; errors?: Record<string, string> };

const createSchema = z.object({
  menuId: z.uuid({ error: "메뉴를 선택해 주세요." }),
  title: postTitleSchema,
});

export async function createPost(
  _prev: CreatePostState,
  formData: FormData,
): Promise<CreatePostState> {
  const admin = await requireAdmin("/admin/posts/new");
  const parsed = createSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    const errors: Record<string, string> = {};
    for (const issue of parsed.error.issues) errors[String(issue.path[0])] ??= issue.message;
    return { errors };
  }

  const supabase = await createClient();
  const { data: menu } = await supabase
    .from("menus")
    .select("id, type")
    .eq("id", parsed.data.menuId)
    .maybeSingle();
  if (menu?.type !== "series")
    return { errors: { menuId: "게시글(차시형 문서) 메뉴를 선택해 주세요." } };

  const { data: last } = await supabase
    .from("posts")
    .select("sort_order")
    .eq("menu_id", menu.id)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: post, error } = await supabase
    .from("posts")
    .insert({
      menu_id: menu.id,
      title: parsed.data.title,
      slug: newPostSlug(),
      sort_order: (last?.sort_order ?? 0) + 1,
      author_id: admin.id,
    })
    .select("id")
    .single();
  if (error || !post) return { message: "게시물을 만들지 못했습니다. 잠시 후 다시 시도해 주세요." };

  redirect(editorPath(post.id));
}

// ─────────────────────────────────────────────────────────────
// 본문 저장(자동 저장·직접 저장). 공개 글은 미공개 수정본(draft_*)에만 저장한다(결정 2-a).
// ─────────────────────────────────────────────────────────────
export async function savePostContent(
  id: string,
  input: { title: string; content: unknown },
  options: { manual?: boolean } = {},
): Promise<ActionResult<{ savedAt: string; hasUnpublishedChanges: boolean }>> {
  const admin = await requireAdmin();
  if (!idSchema.safeParse(id).success) return { ok: false, message: "게시물을 찾을 수 없습니다." };
  const title = postTitleSchema.safeParse(input.title);
  if (!title.success) return { ok: false, message: title.error.issues[0].message };
  const content = postContentSchema.safeParse(input.content);
  if (!content.success) return { ok: false, message: content.error.issues[0].message };

  const supabase = await createClient();
  const post = await loadStatus(supabase, id);
  if (!post) return { ok: false, message: "게시물을 찾을 수 없습니다." };
  if (post.deleted_at) return { ok: false, message: "휴지통에 있는 게시물은 고칠 수 없습니다." };

  const savedAt = new Date().toISOString();
  const published = post.status === "published";
  const { error } = await supabase
    .from("posts")
    .update(
      published
        ? { draft_title: title.data, draft_content: json(content.data), draft_saved_at: savedAt }
        : {
            title: title.data,
            content: json(content.data),
            content_text: extractPlainText(content.data),
          },
    )
    .eq("id", id);
  if (error) return { ok: false, message: FAIL };

  await addRevision(supabase, id, admin.id, title.data, content.data, !!options.manual);
  return { ok: true, savedAt, hasUnpublishedChanges: published };
}

// ─────────────────────────────────────────────────────────────
// 공개 / 변경 사항 공개 / 초안으로 돌리기
// ─────────────────────────────────────────────────────────────
type Body = { title: string; content: Block[] };

/** 현재 에디터 기준 제목·본문(공개 글이면 수정본 우선) */
async function editingBody(supabase: Supabase, id: string): Promise<Body | null> {
  const [{ data: post }, { data: rows }] = await Promise.all([
    supabase.from("posts").select("title").eq("id", id).maybeSingle(),
    supabase.rpc("get_post_editor_content", { p_post_id: id }),
  ]);
  const body = rows?.[0];
  if (!post || !body) return null;
  return {
    title: body.draft_title ?? post.title,
    content: (body.draft_content ?? body.content) as Block[],
  };
}

/** 초안이면 공개하고, 공개 글이면 미공개 수정본을 사이트에 반영한다. */
export async function publishPost(id: string): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!idSchema.safeParse(id).success) return { ok: false, message: "게시물을 찾을 수 없습니다." };
  const supabase = await createClient();
  const post = await loadStatus(supabase, id);
  if (!post || post.deleted_at) return { ok: false, message: "게시물을 찾을 수 없습니다." };

  const body = await editingBody(supabase, id);
  if (!body) return { ok: false, message: FAIL };
  const { error } = await supabase
    .from("posts")
    .update({
      status: "published",
      title: body.title,
      content: json(body.content),
      content_text: extractPlainText(body.content),
      draft_title: null,
      draft_content: null,
      draft_saved_at: null,
    })
    .eq("id", id);
  if (error) return { ok: false, message: "공개하지 못했습니다. 잠시 후 다시 시도해 주세요." };

  await addRevision(supabase, id, admin.id, body.title, body.content, true);
  revalidatePath("/", "layout");
  return { ok: true };
}

/** 공개 글을 초안으로 돌린다. 미공개 수정본이 있으면 그것을 본문으로 삼는다. */
export async function unpublishPost(id: string): Promise<ActionResult> {
  await requireAdmin();
  if (!idSchema.safeParse(id).success) return { ok: false, message: "게시물을 찾을 수 없습니다." };
  const supabase = await createClient();
  const body = await editingBody(supabase, id);
  if (!body) return { ok: false, message: "게시물을 찾을 수 없습니다." };

  const { error } = await supabase
    .from("posts")
    .update({
      status: "draft",
      title: body.title,
      content: json(body.content),
      content_text: extractPlainText(body.content),
      draft_title: null,
      draft_content: null,
      draft_saved_at: null,
    })
    .eq("id", id);
  if (error) return { ok: false, message: "초안으로 돌리지 못했습니다." };
  revalidatePath("/", "layout");
  return { ok: true };
}

/** 공개 글의 미공개 수정본을 버리고 공개본으로 되돌린다. */
export async function discardChanges(id: string): Promise<ActionResult> {
  await requireAdmin();
  if (!idSchema.safeParse(id).success) return { ok: false, message: "게시물을 찾을 수 없습니다." };
  const supabase = await createClient();
  const { error } = await supabase
    .from("posts")
    .update({ draft_title: null, draft_content: null, draft_saved_at: null })
    .eq("id", id);
  if (error) return { ok: false, message: "되돌리지 못했습니다." };
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────
// 게시물 정보(차시 번호·주소·요약): 바로 반영된다.
// ─────────────────────────────────────────────────────────────
export type MetaState = { ok?: boolean; message?: string; errors?: Record<string, string> };

const metaSchema = z.object({
  lessonNo: z
    .string()
    .trim()
    .transform((v) => (v === "" ? null : Number(v)))
    .pipe(
      z
        .number({ error: "차시 번호는 숫자로 입력해 주세요." })
        .int("차시 번호는 정수로 입력해 주세요.")
        .min(0, "0 이상으로 입력해 주세요.")
        .max(999, "999 이하로 입력해 주세요.")
        .nullable(),
    ),
  slug: menuSlugSchema,
  summary: z
    .string()
    .trim()
    .max(300, "요약은 300자 이하여야 합니다.")
    .transform((v) => v || null),
});

export async function updatePostMeta(
  id: string,
  _prev: MetaState,
  formData: FormData,
): Promise<MetaState> {
  await requireAdmin();
  if (!idSchema.safeParse(id).success) return { message: "게시물을 찾을 수 없습니다." };
  const parsed = metaSchema.safeParse({
    lessonNo: formData.get("lessonNo") ?? "",
    slug: formData.get("slug") ?? "",
    summary: formData.get("summary") ?? "",
  });
  if (!parsed.success) {
    const errors: Record<string, string> = {};
    for (const issue of parsed.error.issues) errors[String(issue.path[0])] ??= issue.message;
    return { errors };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("posts")
    .update({
      lesson_no: parsed.data.lessonNo,
      slug: parsed.data.slug,
      summary: parsed.data.summary,
    })
    .eq("id", id);
  if (error?.code === "23505") return { errors: { slug: "같은 메뉴에 이미 있는 주소입니다." } };
  if (error) return { message: FAIL };

  revalidatePath(editorPath(id));
  revalidatePath("/", "layout");
  return { ok: true, message: "게시물 정보를 저장했습니다." };
}

// ─────────────────────────────────────────────────────────────
// 저장 이력
// ─────────────────────────────────────────────────────────────
export type RevisionItem = { id: string; title: string; createdAt: string; editor: string | null };

export async function listRevisions(
  id: string,
): Promise<ActionResult<{ revisions: RevisionItem[] }>> {
  await requireAdmin();
  if (!idSchema.safeParse(id).success) return { ok: false, message: "게시물을 찾을 수 없습니다." };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("post_revisions")
    .select("id, title, created_at, profiles(nickname)")
    .eq("post_id", id)
    .order("created_at", { ascending: false });
  if (error) return { ok: false, message: "이력을 불러오지 못했습니다." };
  return {
    ok: true,
    revisions: data.map((r) => ({
      id: r.id,
      title: r.title,
      createdAt: r.created_at,
      editor: (r.profiles as { nickname: string } | null)?.nickname ?? null,
    })),
  };
}

/**
 * 이력 복원. 지금 상태를 먼저 이력으로 남겨 되돌릴 수 있게 한다.
 * 공개 글이면 미공개 수정본으로 복원된다(사이트에는 "변경 사항 공개" 후 반영).
 */
export async function restoreRevision(
  id: string,
  revisionId: string,
): Promise<ActionResult<{ title: string; content: Block[] }>> {
  const admin = await requireAdmin();
  if (!idSchema.safeParse(id).success || !idSchema.safeParse(revisionId).success) {
    return { ok: false, message: "잘못된 요청입니다." };
  }
  const supabase = await createClient();
  const { data: revision } = await supabase
    .from("post_revisions")
    .select("title, content")
    .eq("id", revisionId)
    .eq("post_id", id)
    .maybeSingle();
  if (!revision) return { ok: false, message: "이력을 찾을 수 없습니다." };

  const current = await editingBody(supabase, id);
  if (current) await addRevision(supabase, id, admin.id, current.title, current.content, true);

  const content = revision.content as Block[];
  const result = await savePostContent(id, { title: revision.title, content }, { manual: false });
  if (!result.ok) return result;
  return { ok: true, title: revision.title, content };
}

// ─────────────────────────────────────────────────────────────
// 파일 업로드: 서버가 관리자 확인 후 서명 업로드 URL을 주고(요청 크기 제한 회피),
// 브라우저가 올린 뒤 confirmUpload로 실제 크기·형식을 다시 확인한다.
// ─────────────────────────────────────────────────────────────
const uploadRequestSchema = z.object({
  postId: z.uuid(),
  fileName: z.string().trim().min(1).max(255),
  type: z.string().max(200),
  size: z.number().int().nonnegative(),
});

export async function requestUpload(
  input: z.input<typeof uploadRequestSchema>,
): Promise<ActionResult<{ path: string; token: string; contentType: string }>> {
  await requireAdmin();
  const parsed = uploadRequestSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "잘못된 요청입니다." };
  const { postId, fileName, size } = parsed.data;
  const contentType = resolveMimeType(fileName, parsed.data.type);
  const problem = uploadError(contentType, size);
  if (problem) return { ok: false, message: problem };

  const supabase = await createClient();
  const post = await loadStatus(supabase, postId);
  if (!post || post.deleted_at) return { ok: false, message: "게시물을 찾을 수 없습니다." };

  const path = `${postId}/${randomUUID()}-${storageSafeName(fileName)}`;
  const { data, error } = await createAdminClient()
    .storage.from(POST_FILES_BUCKET)
    .createSignedUploadUrl(path);
  if (error || !data) return { ok: false, message: "업로드를 준비하지 못했습니다." };
  return { ok: true, path, token: data.token, contentType };
}

export async function confirmUpload(input: {
  postId: string;
  path: string;
  fileName: string;
}): Promise<ActionResult<{ url: string }>> {
  await requireAdmin();
  const postId = idSchema.safeParse(input.postId);
  if (!postId.success || !input.path.startsWith(`${input.postId}/`) || input.path.includes("..")) {
    return { ok: false, message: "잘못된 요청입니다." };
  }
  const fileName = input.fileName.trim().slice(0, 255) || "file";
  const storage = createAdminClient().storage.from(POST_FILES_BUCKET);

  // 브라우저가 알린 값이 아니라 실제 올라간 파일의 크기·형식으로 다시 검사한다.
  const { data: info, error } = await storage.info(input.path);
  if (error || !info) return { ok: false, message: "올린 파일을 찾을 수 없습니다." };
  const size = Number(info.size ?? 0);
  const mime = String(info.contentType ?? "");
  const problem = uploadError(mime, size);
  if (problem) {
    await storage.remove([input.path]);
    return { ok: false, message: problem };
  }

  const supabase = await createClient();
  const { error: insertError } = await supabase.from("attachments").insert({
    post_id: postId.data,
    storage_path: input.path,
    file_name: fileName,
    mime_type: mime,
    size_bytes: size,
  });
  if (insertError) {
    await storage.remove([input.path]);
    return { ok: false, message: "파일 정보를 저장하지 못했습니다." };
  }
  return { ok: true, url: storage.getPublicUrl(input.path).data.publicUrl };
}
