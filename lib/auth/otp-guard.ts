import "server-only";

import { normalizeEmail } from "@/lib/auth/email";
import { type OtpAttemptRecord } from "@/lib/auth/otp-policy";
import { sha256Hex } from "@/lib/hash";
import { createAdminClient } from "@/lib/supabase/admin";

// 이메일 원문은 저장하지 않는다.
function emailHash(email: string): string {
  return sha256Hex(`otp:${normalizeEmail(email)}`);
}

/** 새 코드를 보냈을 때 오류 횟수를 초기화한다. */
export async function resetOtpAttempts(email: string): Promise<void> {
  const now = new Date().toISOString();
  const { error } = await createAdminClient()
    .from("otp_attempts")
    .upsert({ email_hash: emailHash(email), fail_count: 0, issued_at: now, updated_at: now });
  if (error) throw new Error(`OTP 기록 초기화 실패: ${error.message}`);
}

export async function getOtpAttempts(email: string): Promise<OtpAttemptRecord | null> {
  const { data, error } = await createAdminClient()
    .from("otp_attempts")
    .select("fail_count, issued_at")
    .eq("email_hash", emailHash(email))
    .maybeSingle();
  if (error) throw new Error(`OTP 기록 조회 실패: ${error.message}`);
  return data;
}

/** 코드 검증 실패 1회를 기록하고 누적 횟수를 반환한다. */
export async function recordOtpFailure(email: string): Promise<number> {
  const current = await getOtpAttempts(email);
  const failCount = (current?.fail_count ?? 0) + 1;
  const now = new Date().toISOString();
  const { error } = await createAdminClient()
    .from("otp_attempts")
    .upsert({
      email_hash: emailHash(email),
      fail_count: failCount,
      issued_at: current?.issued_at ?? now,
      updated_at: now,
    });
  if (error) throw new Error(`OTP 오류 기록 실패: ${error.message}`);
  return failCount;
}

export async function clearOtpAttempts(email: string): Promise<void> {
  await createAdminClient().from("otp_attempts").delete().eq("email_hash", emailHash(email));
}
