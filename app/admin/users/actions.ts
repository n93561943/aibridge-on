"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireAdmin } from "@/lib/auth/current-user";
import { guardianSendErrorMessage, sendGuardianConsent } from "@/lib/guardian/service";
import { sendMail } from "@/lib/mail/send";
import { teacherReviewMail } from "@/lib/mail/templates/teacher-review";
import { absoluteUrl } from "@/lib/site";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

/*
 * 회원 관리(F-03) 액션. 권한: 화면(관리자 레이아웃) + 여기(requireAdmin) + DB(관리자 RPC의 is_admin·안전 규칙).
 * 역할·상태 변경은 RPC로만 한다. service role은 계정 삭제(auth)와 보호자 메일 발송 기록에만 쓴다.
 */

export type UserActionResult = { ok: boolean; message: string };

const RETRY = "잠시 후 다시 시도해 주세요.";

function revalidateUsers(userId?: string) {
  revalidatePath("/admin", "layout");
  revalidatePath("/admin/users");
  if (userId) revalidatePath(`/admin/users/${userId}`);
}

/** DB가 보낸 안내(안전 규칙 위반 등)는 그대로, 그 밖의 오류는 일반 문구로 */
function rpcMessage(error: { code?: string; message: string }, fallback: string): string {
  return ["42501", "23514", "22023", "P0002"].includes(error.code ?? "")
    ? error.message
    : `${fallback} ${RETRY}`;
}

const reviewSchema = z
  .object({
    ids: z.array(z.uuid()).min(1, "회원을 골라 주세요.").max(100),
    approve: z.boolean(),
    reason: z.string().trim().max(300, "반려 사유는 300자 이하여야 합니다.").optional(),
  })
  .refine((v) => v.approve || !!v.reason, { message: "반려 사유를 입력해 주세요." });

/** 교사 신청 승인·반려(여러 명). 처리 뒤 결과 메일을 보낸다(실패해도 처리는 유지하고 건수를 알린다). */
export async function reviewTeachers(
  input: z.input<typeof reviewSchema>,
): Promise<UserActionResult> {
  await requireAdmin("/admin/users");
  const parsed = reviewSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
  const { ids, approve, reason } = parsed.data;

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_review_teachers", {
    p_ids: ids,
    p_approve: approve,
    p_reason: reason ?? undefined,
  });
  if (error) return { ok: false, message: rpcMessage(error, "처리하지 못했습니다.") };

  const reviewed = data ?? [];
  const results = await Promise.all(
    reviewed.map((u) =>
      sendMail(
        teacherReviewMail({
          to: u.email,
          nickname: u.nickname,
          approved: approve,
          reason,
          meUrl: absoluteUrl("/me"),
        }),
      ),
    ),
  );
  const failed = results.filter((r) => !r.ok).length;
  revalidateUsers();

  const verb = approve ? "승인" : "반려";
  if (!reviewed.length) return { ok: false, message: "처리할 신청이 없습니다(이미 처리됨)." };
  return {
    ok: true,
    message:
      `${reviewed.length}명을 ${verb}했습니다.` +
      (failed ? ` 결과 메일 ${failed}건을 보내지 못했습니다.` : " 결과 메일을 보냈습니다."),
  };
}

const roleSchema = z.object({
  userId: z.uuid(),
  role: z.enum(["student", "teacher", "admin"]),
});

export async function setUserRole(input: z.input<typeof roleSchema>): Promise<UserActionResult> {
  await requireAdmin("/admin/users");
  const parsed = roleSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "잘못된 요청입니다." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_set_role", {
    p_user: parsed.data.userId,
    p_role: parsed.data.role,
  });
  if (error) return { ok: false, message: rpcMessage(error, "등급을 바꾸지 못했습니다.") };
  revalidateUsers(parsed.data.userId);
  return { ok: true, message: "등급을 바꿨습니다." };
}

const statusSchema = z.object({
  userId: z.uuid(),
  status: z.enum(["active", "suspended"]),
});

export async function setUserStatus(
  input: z.input<typeof statusSchema>,
): Promise<UserActionResult> {
  await requireAdmin("/admin/users");
  const parsed = statusSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "잘못된 요청입니다." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_set_status", {
    p_user: parsed.data.userId,
    p_status: parsed.data.status,
  });
  if (error) return { ok: false, message: rpcMessage(error, "상태를 바꾸지 못했습니다.") };
  revalidateUsers(parsed.data.userId);
  return {
    ok: true,
    message: parsed.data.status === "suspended" ? "이용을 정지했습니다." : "정지를 풀었습니다.",
  };
}

const withdrawSchema = z.object({ userId: z.uuid(), confirm: z.string() });

/**
 * 강제 탈퇴: 확인을 위해 회원 닉네임을 그대로 입력받는다.
 * DB가 규칙 검사·이력 기록(admin_prepare_withdraw)을 한 뒤 auth 사용자를 지운다(profiles 등은 cascade,
 * 쓴 글·댓글은 남고 작성자만 비워진다 — 본인 탈퇴와 같다).
 */
export async function forceWithdrawUser(
  input: z.input<typeof withdrawSchema>,
): Promise<UserActionResult> {
  await requireAdmin("/admin/users");
  const parsed = withdrawSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "잘못된 요청입니다." };
  const supabase = await createClient();
  const { data: target } = await supabase
    .from("profiles")
    .select("nickname")
    .eq("id", parsed.data.userId)
    .maybeSingle();
  if (!target) return { ok: false, message: "회원을 찾을 수 없습니다." };
  if (parsed.data.confirm.trim() !== target.nickname) {
    return {
      ok: false,
      message: `확인을 위해 닉네임 "${target.nickname}"을 그대로 입력해 주세요.`,
    };
  }

  const { error } = await supabase.rpc("admin_prepare_withdraw", { p_user: parsed.data.userId });
  if (error) return { ok: false, message: rpcMessage(error, "탈퇴시키지 못했습니다.") };
  const { error: deleteError } = await createAdminClient().auth.admin.deleteUser(
    parsed.data.userId,
  );
  if (deleteError) return { ok: false, message: `탈퇴시키지 못했습니다. ${RETRY}` };

  revalidateUsers();
  redirect("/admin/users?notice=withdrawn");
}

/** 보호자 동의 메일 재발송(발송 간격·하루 한도는 회원 재발송과 같다) */
export async function resendGuardianMailFor(userId: string): Promise<UserActionResult> {
  await requireAdmin("/admin/users");
  const id = z.uuid().safeParse(userId);
  if (!id.success) return { ok: false, message: "잘못된 요청입니다." };
  const supabase = await createClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, nickname, guardian_email, created_at, status")
    .eq("id", id.data)
    .maybeSingle();
  if (!profile || profile.status !== "pending_guardian" || !profile.guardian_email) {
    return { ok: false, message: "보호자 동의 대기 회원이 아닙니다." };
  }
  const { error } = await supabase.rpc("admin_log_guardian_resend", { p_user: profile.id });
  if (error) return { ok: false, message: rpcMessage(error, "보내지 못했습니다.") };

  const result = await sendGuardianConsent({
    id: profile.id,
    nickname: profile.nickname,
    guardian_email: profile.guardian_email,
    created_at: profile.created_at,
  });
  if (!result.ok) return { ok: false, message: guardianSendErrorMessage(result) };
  revalidateUsers(profile.id);
  return { ok: true, message: "보호자에게 동의 메일을 다시 보냈습니다." };
}
