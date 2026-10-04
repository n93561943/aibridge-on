import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database";

import { POST_FILES_BUCKET, TRASH_RETENTION_DAYS } from "./constants";

const BATCH = 100;

export type PurgeResult = { posts: number; files: number };

/** 휴지통 보관 기간이 지난 시각 기준점 */
export function trashCutoff(now: Date, days = TRASH_RETENTION_DAYS): Date {
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
}

/**
 * 휴지통에서 30일이 지난 게시물을 영구 삭제한다. service role 클라이언트로만 호출한다.
 * Storage 파일을 먼저 지우고 DB 행을 지운다(이력·첨부 행은 cascade).
 * 파일 삭제가 실패하면 그 묶음의 게시물은 남겨 두고 다음 실행 때 다시 시도한다.
 */
export async function purgeExpiredTrash(
  db: SupabaseClient<Database>,
  now = new Date(),
): Promise<PurgeResult> {
  const result: PurgeResult = { posts: 0, files: 0 };
  const cutoff = trashCutoff(now).toISOString();

  for (;;) {
    const { data: posts, error } = await db
      .from("posts")
      .select("id")
      .lt("deleted_at", cutoff)
      .limit(BATCH);
    if (error) throw new Error(`휴지통 조회 실패: ${error.message}`);
    if (!posts.length) return result;

    const ids = posts.map((p) => p.id);
    const files = await deletePostsWithFiles(db, ids);
    result.posts += ids.length;
    result.files += files;
    if (ids.length < BATCH) return result;
  }
}

/**
 * 게시물을 영구 삭제한다: Storage 파일을 먼저 지우고 DB 행을 지운다(이력·첨부 행은 cascade).
 * 파일 삭제가 실패하면 게시물을 지우지 않고 오류를 낸다. 지운 파일 수를 돌려준다.
 * db는 service role 클라이언트(파일 삭제에 필요). 호출 전에 관리자 권한을 확인한다.
 */
export async function deletePostsWithFiles(
  db: SupabaseClient<Database>,
  ids: string[],
): Promise<number> {
  if (!ids.length) return 0;
  const { data: files, error: filesError } = await db
    .from("attachments")
    .select("storage_path")
    .in("post_id", ids);
  if (filesError) throw new Error(`첨부 조회 실패: ${filesError.message}`);

  const paths = files.map((f) => f.storage_path);
  for (let i = 0; i < paths.length; i += BATCH) {
    const { error: removeError } = await db.storage
      .from(POST_FILES_BUCKET)
      .remove(paths.slice(i, i + BATCH));
    if (removeError) throw new Error(`파일 삭제 실패: ${removeError.message}`);
  }

  const { error: deleteError } = await db.from("posts").delete().in("id", ids);
  if (deleteError) throw new Error(`게시물 삭제 실패: ${deleteError.message}`);
  return paths.length;
}

/** 글에 연결되지 않은 게시판 업로드를 지우기까지의 시간(P5-3) */
export const UNLINKED_UPLOAD_HOURS = 24;

/**
 * 글을 쓰다 말아 어느 글에도 연결되지 않은 업로드(24시간 경과)를 파일과 함께 지운다.
 * 글 저장과 업로드 연결은 한 트랜잭션이므로(create_board_post) 저장된 글의 이미지는 지워지지 않는다.
 * 파일 삭제가 실패하면 그 묶음의 기록은 남겨 두고 다음 실행 때 다시 시도한다. 지운 파일 수를 돌려준다.
 */
export async function purgeUnlinkedUploads(
  db: SupabaseClient<Database>,
  now = new Date(),
): Promise<number> {
  const cutoff = new Date(now.getTime() - UNLINKED_UPLOAD_HOURS * 60 * 60 * 1000).toISOString();
  let total = 0;
  for (;;) {
    const { data: rows, error } = await db
      .from("attachments")
      .select("id, storage_path")
      .is("post_id", null)
      .lt("created_at", cutoff)
      .limit(BATCH);
    if (error) throw new Error(`미연결 업로드 조회 실패: ${error.message}`);
    if (!rows.length) return total;

    const { error: removeError } = await db.storage
      .from(POST_FILES_BUCKET)
      .remove(rows.map((r) => r.storage_path));
    if (removeError) throw new Error(`파일 삭제 실패: ${removeError.message}`);
    const { error: deleteError } = await db
      .from("attachments")
      .delete()
      .in(
        "id",
        rows.map((r) => r.id),
      );
    if (deleteError) throw new Error(`업로드 기록 삭제 실패: ${deleteError.message}`);
    total += rows.length;
    if (rows.length < BATCH) return total;
  }
}
