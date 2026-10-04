"use server";

import { randomUUID } from "node:crypto";

import { revalidateTag } from "next/cache";
import { z } from "zod";

import { cleanBoardContent, boardTitleSchema, uploadUrlPrefix } from "@/lib/board/content";
import {
  findActiveBoard,
  getActiveMember,
  getWriteAccess,
  writeAccessMessages,
} from "@/lib/board/write";
import { getSupabasePublicConfig } from "@/lib/env";
import { menuPath, postPath } from "@/lib/menus/tree";
import {
  isImageMime,
  POST_FILES_BUCKET,
  storageSafeName,
  uploadError,
} from "@/lib/posts/constants";
import { newPostSlug } from "@/lib/posts/editor";
import { POSTS_CACHE_TAG } from "@/lib/posts/public";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/types/database";

type Result<T = object> = ({ ok: true } & T) | { ok: false; message: string };

const RETRY = "잠시 후 다시 시도해 주세요.";
const IMAGE_ONLY = "이미지(PNG·JPG·GIF·WEBP)만 올릴 수 있습니다.";

/* ─── 이미지 업로드 ───────────────────────────────────────────
 * 권한: 화면(글쓰기 화면은 권한 있는 회원만) + 여기(활동 회원·글쓰기 등급·형식·크기·한도)
 *       + DB(attachments 트리거: 본인 경로·하루 한도, RLS: 본인 기록만)
 */

const uploadRequestSchema = z.object({
  menuId: z.uuid(),
  fileName: z.string().trim().min(1).max(255),
  type: z.string().max(200),
  size: z.number().int().nonnegative(),
});

export async function requestBoardUpload(
  input: z.input<typeof uploadRequestSchema>,
): Promise<Result<{ path: string; token: string; contentType: string }>> {
  const parsed = uploadRequestSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "잘못된 요청입니다." };
  const { menuId, fileName, type, size } = parsed.data;

  const access = await getWriteAccess(menuId);
  if (!access.ok) return { ok: false, message: writeAccessMessages[access.reason] };
  if (!isImageMime(type)) return { ok: false, message: IMAGE_ONLY };
  const problem = uploadError(type, size);
  if (problem) return { ok: false, message: problem };

  // 한도는 DB가 최종 판단한다. 여기서는 파일을 올리기 전에 미리 알려 주기만 한다.
  const supabase = await createClient();
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const [{ count }, { data: limit }] = await Promise.all([
    supabase
      .from("attachments")
      .select("id", { count: "exact", head: true })
      .eq("uploaded_by", access.userId)
      .gt("created_at", since),
    supabase.rpc("board_upload_daily_limit"),
  ]);
  if (typeof limit === "number" && (count ?? 0) >= limit) {
    return {
      ok: false,
      message: "오늘 올릴 수 있는 이미지 수를 넘었습니다. 내일 다시 시도해 주세요.",
    };
  }

  const path = `board/${access.userId}/${randomUUID()}-${storageSafeName(fileName)}`;
  const { data, error } = await createAdminClient()
    .storage.from(POST_FILES_BUCKET)
    .createSignedUploadUrl(path);
  if (error || !data) return { ok: false, message: `업로드를 준비하지 못했습니다. ${RETRY}` };
  return { ok: true, path, token: data.token, contentType: type };
}

const confirmSchema = z.object({
  menuId: z.uuid(),
  path: z.string().min(1).max(400),
  fileName: z.string().trim().min(1).max(255),
});

export async function confirmBoardUpload(
  input: z.input<typeof confirmSchema>,
): Promise<Result<{ url: string }>> {
  const parsed = confirmSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "잘못된 요청입니다." };
  const { menuId, path, fileName } = parsed.data;

  const access = await getWriteAccess(menuId);
  if (!access.ok) return { ok: false, message: writeAccessMessages[access.reason] };
  if (!path.startsWith(`board/${access.userId}/`) || path.includes("..")) {
    return { ok: false, message: "잘못된 요청입니다." };
  }

  // 브라우저가 알린 값이 아니라 실제 올라간 파일의 크기·형식으로 다시 검사한다.
  const storage = createAdminClient().storage.from(POST_FILES_BUCKET);
  const { data: info, error } = await storage.info(path);
  if (error || !info) return { ok: false, message: "올린 파일을 찾을 수 없습니다." };
  const size = Number(info.size ?? 0);
  const mime = String(info.contentType ?? "");
  const problem = isImageMime(mime) ? uploadError(mime, size) : IMAGE_ONLY;
  if (problem) {
    await storage.remove([path]);
    return { ok: false, message: problem };
  }

  // 회원 세션으로 기록한다(RLS·트리거가 본인 경로·하루 한도를 다시 검사).
  const supabase = await createClient();
  const { error: insertError } = await supabase.from("attachments").insert({
    storage_path: path,
    file_name: fileName,
    mime_type: mime,
    size_bytes: size,
    uploaded_by: access.userId,
  });
  if (insertError) {
    await storage.remove([path]);
    return {
      ok: false,
      message:
        insertError.code === "P0429"
          ? insertError.message
          : `이미지를 저장하지 못했습니다. ${RETRY}`,
    };
  }
  return { ok: true, url: storage.getPublicUrl(path).data.publicUrl };
}

/* ─── 글 저장 ────────────────────────────────────────────────
 * 권한: 화면 + 여기(글쓰기 등급·본문 규칙·본인 업로드만) + DB(RLS·트리거: 등급·1분 제한·관리 항목 고정)
 */

/** 제목·본문 검사와 "본문 이미지가 모두 본인 업로드인가" 확인 */
async function validatePost(
  input: { title: unknown; content: unknown },
  userId: string,
): Promise<
  | { ok: true; title: string; content: Json; contentText: string; imagePaths: string[] }
  | { ok: false; message: string; field?: "title" }
> {
  const title = boardTitleSchema.safeParse(input.title);
  if (!title.success) return { ok: false, message: title.error.issues[0].message, field: "title" };

  const config = getSupabasePublicConfig();
  if (!config) return { ok: false, message: `저장하지 못했습니다. ${RETRY}` };
  const body = cleanBoardContent(input.content, uploadUrlPrefix(config.url));
  if (!body.ok) return body;

  if (body.imagePaths.length) {
    const supabase = await createClient();
    const { data } = await supabase
      .from("attachments")
      .select("storage_path")
      .eq("uploaded_by", userId)
      .in("storage_path", body.imagePaths);
    if ((data?.length ?? 0) !== body.imagePaths.length) {
      return {
        ok: false,
        message: "직접 올린 이미지만 쓸 수 있습니다. 이미지를 다시 올려 주세요.",
      };
    }
  }
  return {
    ok: true,
    title: title.data,
    content: body.content as unknown as Json,
    contentText: body.contentText,
    imagePaths: body.imagePaths,
  };
}

function saveErrorMessage(error: { code?: string; message: string }): string {
  // 1분에 1개(P0429), DB 본문 검사(22023: check_member_board_content)
  if (error.code === "P0429" || error.code === "22023") return error.message;
  if (error.code === "42501" || error.code === "P0002") {
    return "이 게시판에 글을 쓸 수 없습니다. 새로고침해 주세요.";
  }
  return `저장하지 못했습니다. ${RETRY}`;
}

export type SaveResult =
  { ok: true; href: string } | { ok: false; message: string; field?: "title" };

const createSchema = z.object({ menuId: z.uuid(), title: z.unknown(), content: z.unknown() });

export async function createBoardPost(input: z.input<typeof createSchema>): Promise<SaveResult> {
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "잘못된 요청입니다." };
  const board = await findActiveBoard(parsed.data.menuId);
  if (!board) return { ok: false, message: "게시판을 찾을 수 없습니다." };
  const access = await getWriteAccess(board.menu.id);
  if (!access.ok) return { ok: false, message: writeAccessMessages[access.reason] };

  const post = await validatePost(parsed.data, access.userId);
  if (!post.ok) return post;

  const supabase = await createClient();
  // 주소(slug)가 우연히 겹치면 한 번 더 시도한다.
  for (let attempt = 0; attempt < 2; attempt++) {
    const slug = newPostSlug();
    const { error } = await supabase.rpc("create_board_post", {
      p_menu_id: board.menu.id,
      p_slug: slug,
      p_title: post.title,
      p_content: post.content,
      p_content_text: post.contentText,
      p_upload_paths: post.imagePaths,
    });
    if (!error) {
      revalidateTag(POSTS_CACHE_TAG);
      return { ok: true, href: postPath(board.menu, board.parent, slug) };
    }
    if (error.code !== "23505") return { ok: false, message: saveErrorMessage(error) };
  }
  return { ok: false, message: `저장하지 못했습니다. ${RETRY}` };
}

const updateSchema = z.object({
  menuId: z.uuid(),
  postId: z.uuid(),
  title: z.unknown(),
  content: z.unknown(),
});

export async function updateBoardPost(input: z.input<typeof updateSchema>): Promise<SaveResult> {
  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "잘못된 요청입니다." };
  const board = await findActiveBoard(parsed.data.menuId);
  if (!board) return { ok: false, message: "게시판을 찾을 수 없습니다." };
  // 수정은 글쓰기 등급과 관계없이 작성자 본인이면 된다(DB가 작성자·휴지통·숨김을 확인).
  const member = await getActiveMember();
  if (!member.ok) return { ok: false, message: writeAccessMessages[member.reason] };
  const userId = member.userId;

  const post = await validatePost(parsed.data, userId);
  if (!post.ok) return post;

  const supabase = await createClient();
  const { error } = await supabase.rpc("update_board_post", {
    p_post_id: parsed.data.postId,
    p_title: post.title,
    p_content: post.content,
    p_content_text: post.contentText,
    p_upload_paths: post.imagePaths,
  });
  if (error) {
    return {
      ok: false,
      message: error.code === "P0002" ? "고칠 수 없는 글입니다." : saveErrorMessage(error),
    };
  }
  revalidateTag(POSTS_CACHE_TAG);
  // 본인 글 주소(slug)는 RLS("본인 게시물 조회")로 읽을 수 있다.
  const { data: saved } = await supabase
    .from("posts")
    .select("slug")
    .eq("id", parsed.data.postId)
    .single();
  return {
    ok: true,
    href: saved
      ? postPath(board.menu, board.parent, saved.slug)
      : menuPath(board.menu, board.parent)!,
  };
}
