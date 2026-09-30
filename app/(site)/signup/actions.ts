"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth/current-user";
import { isAdminEmail, normalizeEmail } from "@/lib/auth/email";
import { safeNextPath } from "@/lib/auth/redirect";
import { getServerEnv } from "@/lib/env.server";
import { sendGuardianConsent } from "@/lib/guardian/service";
import { createAdminClient } from "@/lib/supabase/admin";
import { type FieldErrors, parseSignupInput } from "@/lib/validation/signup";

export type SignupState = {
  errors?: FieldErrors;
  formError?: string;
  /** 오류 시 입력값 복원용(React 19는 제출 후 폼을 초기화한다) */
  values?: Record<string, string>;
};

const RESTORABLE_FIELDS = [
  "nickname",
  "guardianEmail",
  "teacherSchool",
  "teacherPosition",
  "teacherSubject",
  "privacyAgreed",
];

function restorableValues(formData: FormData): Record<string, string> {
  return Object.fromEntries(RESTORABLE_FIELDS.map((k) => [k, String(formData.get(k) ?? "")]));
}

export async function completeSignup(_prev: SignupState, formData: FormData): Promise<SignupState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/signup");
  if (user.profile) redirect("/me");

  // 클라이언트 검사와 별개로 서버에서 다시 검증한다.
  const parsed = parseSignupInput(Object.fromEntries(formData), user.email);
  if (!parsed.ok) return { errors: parsed.errors, values: restorableValues(formData) };
  const input = parsed.data;

  const email = normalizeEmail(user.email);
  const now = new Date().toISOString();
  const isAdmin = isAdminEmail(email, getServerEnv().ADMIN_EMAILS);

  // 역할·상태·14세 관련 컬럼은 사용자가 직접 쓸 수 없으므로(RLS) service role로 만든다.
  const admin = createAdminClient();
  const { error } = await admin.from("profiles").insert({
    id: user.id,
    email,
    nickname: input.nickname,
    role: isAdmin ? "admin" : "student",
    is_under_14: input.isUnder14,
    guardian_email: input.guardianEmail,
    status: input.isUnder14 ? "pending_guardian" : "active",
    privacy_agreed_at: now,
    last_login_at: now,
    ...(input.teacher
      ? {
          teacher_school: input.teacher.teacherSchool,
          teacher_position: input.teacher.teacherPosition,
          teacher_subject: input.teacher.teacherSubject,
          teacher_status: "pending",
          teacher_requested_at: now,
        }
      : {}),
  });

  if (error) {
    // 23505: 이미 가입됨(중복 제출)
    if (error.code === "23505") redirect("/me");
    return {
      formError: "가입 정보를 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.",
      values: restorableValues(formData),
    };
  }

  if (input.isUnder14 && input.guardianEmail) {
    // 발송에 실패해도 가입은 유지하고, 상단 안내 배너에서 다시 보낼 수 있다.
    await sendGuardianConsent({
      id: user.id,
      nickname: input.nickname,
      guardian_email: input.guardianEmail,
    });
  }

  revalidatePath("/", "layout");
  if (input.teacher) redirect("/me?notice=teacher_pending");
  if (input.isUnder14) redirect("/me");
  redirect(safeNextPath(formData.get("next")));
}
