import "server-only";

import { normalizeEmail } from "@/lib/auth/email";
import { sha256Hex } from "@/lib/hash";
import { createAdminClient } from "@/lib/supabase/admin";

// 이메일 원문은 저장하지 않는다.
function emailHash(email: string): string {
  return sha256Hex(`otp:${normalizeEmail(email)}`);
}

/** 새 코드를 보냈을 때 시도 횟수를 초기화한다. */
export async function resetOtpAttempts(email: string): Promise<void> {
  const now = new Date().toISOString();
  const { error } = await createAdminClient()
    .from("otp_attempts")
    .upsert({ email_hash: emailHash(email), fail_count: 0, issued_at: now, updated_at: now });
  if (error) throw new Error(`OTP 기록 초기화 실패: ${error.message}`);
}

/**
 * 검증 전에 시도 1회를 원자적으로 차감하고 누적 횟수를 돌려준다.
 * (읽고-더하고-쓰기를 DB 함수 한 번으로 처리해 동시 요청으로 제한을 우회하지 못하게 한다.)
 */
export async function consumeOtpAttempt(email: string): Promise<number> {
  const { data, error } = await createAdminClient().rpc("consume_otp_attempt", {
    p_email_hash: emailHash(email),
  });
  if (error || typeof data !== "number") throw new Error(`OTP 시도 기록 실패: ${error?.message}`);
  return data;
}

/** 인증 서버 오류로 검증하지 못한 시도는 되돌린다. */
export async function refundOtpAttempt(email: string): Promise<void> {
  await createAdminClient().rpc("consume_otp_attempt", {
    p_email_hash: emailHash(email),
    p_delta: -1,
  });
}

export async function clearOtpAttempts(email: string): Promise<void> {
  await createAdminClient().from("otp_attempts").delete().eq("email_hash", emailHash(email));
}
