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

    result.posts += ids.length;
    result.files += paths.length;
    if (ids.length < BATCH) return result;
  }
}
