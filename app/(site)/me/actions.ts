"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth/current-user";
import { guardianSendErrorMessage, sendGuardianConsent } from "@/lib/guardian/service";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { type FieldErrors, nicknameSchema, teacherInfoSchema } from "@/lib/validation/signup";

import { WITHDRAW_CONFIRM_TEXT } from "./constants";

export type FormState = { ok?: boolean; message?: string; errors?: FieldErrors };

function fieldErrors(issues: { path: PropertyKey[]; message: string }[]): FieldErrors {
  const errors: FieldErrors = {};
  for (const issue of issues) errors[String(issue.path[0] ?? "form")] ??= issue.message;
  return errors;
}

async function requireMemberForAction() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/me");
  if (!user.profile) redirect("/signup");
  return { ...user, profile: user.profile };
}

/** 닉네임 수정: 허용된 컬럼만 사용자 세션(RLS)으로 갱신한다. */
export async function updateNickname(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireMemberForAction();
  const parsed = nicknameSchema.safeParse(formData.get("nickname"));
  if (!parsed.success) return { errors: { nickname: parsed.error.issues[0].message } };

  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({ nickname: parsed.data })
    .eq("id", user.id);
  if (error) return { message: "저장하지 못했습니다. 잠시 후 다시 시도해 주세요." };

  revalidatePath("/", "layout");
  return { ok: true, message: "닉네임을 저장했습니다." };
}

/**
 * 교사 정보 수정 또는 (재)신청.
 * - 신청 안 함·반려: 입력값 저장 + 승인 대기로 전환(service role, 상태 컬럼은 사용자가 못 바꿈)
 * - 대기·승인: 학교·직급·과목만 수정(RLS)
 */
export async function saveTeacherInfo(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireMemberForAction();
  if (user.profile.is_under_14) return { message: "교사 신청은 만 14세 이상만 할 수 있습니다." };

  const parsed = teacherInfoSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { errors: fieldErrors(parsed.error.issues) };
  const info = {
    teacher_school: parsed.data.teacherSchool,
    teacher_position: parsed.data.teacherPosition,
    teacher_subject: parsed.data.teacherSubject,
  };

  const applying = ["none", "rejected"].includes(user.profile.teacher_status);
  if (applying) {
    const { error } = await createAdminClient()
      .from("profiles")
      .update({
        ...info,
        teacher_status: "pending",
        teacher_requested_at: new Date().toISOString(),
        teacher_reviewed_at: null,
        teacher_reject_reason: null,
      })
      .eq("id", user.id)
      .in("teacher_status", ["none", "rejected"]);
    if (error) return { message: "신청하지 못했습니다. 잠시 후 다시 시도해 주세요." };
  } else {
    const supabase = await createClient();
    const { error } = await supabase.from("profiles").update(info).eq("id", user.id);
    if (error) return { message: "저장하지 못했습니다. 잠시 후 다시 시도해 주세요." };
  }

  revalidatePath("/me");
  return {
    ok: true,
    message: applying
      ? "교사 신청을 접수했습니다. 관리자 승인 후 교사 기능을 쓸 수 있습니다."
      : "교사 정보를 저장했습니다.",
  };
}

/** 보호자 동의 메일 재발송(동의 대기 중인 본인만) */
export async function resendGuardianMail(): Promise<FormState> {
  const user = await requireMemberForAction();
  const { profile } = user;
  if (profile.status !== "pending_guardian" || !profile.guardian_email) {
    return { message: "보호자 동의 대기 상태가 아닙니다." };
  }
  const result = await sendGuardianConsent({
    id: profile.id,
    nickname: profile.nickname,
    guardian_email: profile.guardian_email,
    created_at: profile.created_at,
  });
  if (!result.ok) return { message: guardianSendErrorMessage(result) };
  return { ok: true, message: "보호자에게 동의 메일을 다시 보냈습니다." };
}

/** 회원 탈퇴: auth 사용자를 삭제하면 profiles·보호자 동의 기록이 함께 삭제된다(cascade). */
export async function withdraw(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireMemberForAction();
  if (String(formData.get("confirm") ?? "").trim() !== WITHDRAW_CONFIRM_TEXT) {
    return { errors: { confirm: `확인을 위해 "${WITHDRAW_CONFIRM_TEXT}"를 입력해 주세요.` } };
  }
  if (user.profile.role === "admin") {
    const { count } = await createAdminClient()
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("role", "admin")
      .eq("status", "active");
    if ((count ?? 0) <= 1) {
      return { message: "마지막 관리자는 탈퇴할 수 없습니다. 다른 관리자를 먼저 지정해 주세요." };
    }
  }

  const { error } = await createAdminClient().auth.admin.deleteUser(user.id);
  if (error) return { message: "탈퇴를 처리하지 못했습니다. 잠시 후 다시 시도해 주세요." };

  const supabase = await createClient();
  await supabase.auth.signOut({ scope: "local" });
  revalidatePath("/", "layout");
  redirect("/?withdrawn=1");
}
