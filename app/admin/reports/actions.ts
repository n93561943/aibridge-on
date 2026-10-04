"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { z } from "zod";

import { requireAdmin } from "@/lib/auth/current-user";
import { POSTS_CACHE_TAG } from "@/lib/posts/public";
import { createClient } from "@/lib/supabase/server";

export type ReportActionResult = { ok: boolean; message: string };

function revalidateReports() {
  revalidatePath("/admin/reports");
  revalidatePath("/admin", "layout");
  revalidateTag(POSTS_CACHE_TAG);
}

const resolveSchema = z.object({
  reportId: z.uuid(),
  action: z.enum(["hidden", "kept"]),
});

/**
 * 신고 처리: 숨김 또는 유지. 같은 대상의 열린 신고를 모두 처리한다.
 * 권한: 화면(관리자 레이아웃) + 여기(requireAdmin) + DB(resolve_report 안 관리자 확인·RLS).
 */
export async function resolveReport(
  input: z.input<typeof resolveSchema>,
): Promise<ReportActionResult> {
  await requireAdmin("/admin/reports");
  const parsed = resolveSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "잘못된 요청입니다." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("resolve_report", {
    p_report_id: parsed.data.reportId,
    p_action: parsed.data.action,
  });
  if (error) return { ok: false, message: "처리하지 못했습니다. 잠시 후 다시 시도해 주세요." };
  revalidateReports();
  return {
    ok: true,
    message: parsed.data.action === "hidden" ? "숨겼습니다." : "그대로 두기로 했습니다.",
  };
}

const targetSchema = z.object({
  targetType: z.enum(["post", "comment"]),
  targetId: z.uuid(),
});

/** 숨김 해제(잘못 숨겼을 때). 관리자만(RLS: 관리자 게시물·댓글 수정). */
export async function unhideTarget(
  input: z.input<typeof targetSchema>,
): Promise<ReportActionResult> {
  await requireAdmin("/admin/reports");
  const parsed = targetSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "잘못된 요청입니다." };
  const supabase = await createClient();
  const table = parsed.data.targetType === "post" ? "posts" : "comments";
  const { data, error } = await supabase
    .from(table)
    .update({ hidden_at: null })
    .eq("id", parsed.data.targetId)
    .select("id");
  if (error || !data.length) {
    return { ok: false, message: "숨김을 풀지 못했습니다. 잠시 후 다시 시도해 주세요." };
  }
  revalidateReports();
  return { ok: true, message: "숨김을 풀었습니다. 다시 공개됩니다." };
}
