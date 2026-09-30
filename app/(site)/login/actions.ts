"use server";

import { redirect } from "next/navigation";

import { emailSchema } from "@/lib/auth/email";
import {
  clearOtpAttempts,
  consumeOtpAttempt,
  refundOtpAttempt,
  resetOtpAttempts,
} from "@/lib/auth/otp-guard";
import {
  isAuthServiceError,
  isOverOtpLimit,
  OTP_MAX_FAILURES,
  otpCodeRegex,
  remainingOtpAttempts,
} from "@/lib/auth/otp-policy";
import { safeNextPath } from "@/lib/auth/redirect";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type LoginState = {
  step: "email" | "code";
  email?: string;
  /** 코드 발송 시각(ms). 재발송 카운트다운 기준 */
  sentAt?: number;
  error?: string;
  notice?: string;
};

function sendErrorMessage(status: number | undefined, message: string): string {
  if (status === 429 || /only request this after|rate limit/i.test(message)) {
    return "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.";
  }
  return "코드를 보내지 못했습니다. 잠시 후 다시 시도해 주세요.";
}

/** 1단계: 이메일로 6자리 로그인 코드 발송 */
async function sendCode(prev: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = emailSchema.safeParse(formData.get("email"));
  if (!parsed.success) {
    return { step: "email", error: parsed.error.issues[0]?.message ?? "이메일을 확인해 주세요." };
  }
  const email = parsed.data;

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: true },
  });
  if (error) {
    // 재발송 요청이 거절돼도 코드 입력 단계는 유지한다.
    const step = prev.step === "code" && prev.email === email ? "code" : "email";
    return {
      step,
      email,
      sentAt: prev.sentAt,
      error: sendErrorMessage(error.status, error.message),
    };
  }

  await resetOtpAttempts(email);
  return {
    step: "code",
    email,
    sentAt: Date.now(),
    notice: `${email}(으)로 6자리 코드를 보냈습니다. 10분 안에 입력해 주세요.`,
  };
}

/** 2단계: 코드 확인 → 로그인. 처음이면 /signup으로 */
async function verifyCode(prev: LoginState, formData: FormData): Promise<LoginState> {
  const parsedEmail = emailSchema.safeParse(formData.get("email"));
  if (!parsedEmail.success) return { step: "email", error: "이메일을 다시 입력해 주세요." };
  const email = parsedEmail.data;
  const code = String(formData.get("code") ?? "").replace(/\s/g, "");
  const base: LoginState = { step: "code", email, sentAt: prev.sentAt };

  if (!otpCodeRegex.test(code)) return { ...base, error: "6자리 숫자 코드를 입력해 주세요." };

  const lockedMessage = `코드를 ${OTP_MAX_FAILURES}회 잘못 입력해 이 코드는 더 쓸 수 없습니다. 새 코드를 받아 주세요.`;
  // 검증 전에 시도 1회를 먼저 차감한다(동시 요청으로 5회 제한을 우회하지 못하게).
  const attempts = await consumeOtpAttempt(email);
  if (isOverOtpLimit(attempts)) return { ...base, error: lockedMessage };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.verifyOtp({ email, token: code, type: "email" });
  if (error || !data.user) {
    if (isAuthServiceError(error?.status)) {
      await refundOtpAttempt(email);
      return { ...base, error: "로그인 서버가 바쁩니다. 잠시 후 다시 시도해 주세요." };
    }
    const remaining = remainingOtpAttempts(attempts);
    return {
      ...base,
      error:
        remaining > 0
          ? `코드가 올바르지 않거나 만료되었습니다. (남은 시도 ${remaining}회)`
          : lockedMessage,
    };
  }

  await clearOtpAttempts(email);

  const next = safeNextPath(formData.get("next"));
  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("id")
    .eq("id", data.user.id)
    .maybeSingle();

  if (!profile) {
    redirect(next === "/" ? "/signup" : `/signup?next=${encodeURIComponent(next)}`);
  }

  // last_login_at은 사용자가 직접 수정할 수 없는 컬럼이라 service role로 기록한다.
  await admin
    .from("profiles")
    .update({ last_login_at: new Date().toISOString() })
    .eq("id", data.user.id);
  redirect(next);
}

/** 로그인 폼 하나로 발송·재발송·확인을 처리한다(intent로 구분). */
export async function loginAction(prev: LoginState, formData: FormData): Promise<LoginState> {
  switch (formData.get("intent")) {
    case "verify":
      return verifyCode(prev, formData);
    case "reset":
      return { step: "email", email: prev.email };
    default:
      return sendCode(prev, formData);
  }
}
