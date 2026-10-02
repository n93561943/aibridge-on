import "server-only";

import {
  createGuardianToken,
  GUARDIAN_DAILY_SEND_LIMIT,
  GUARDIAN_RESEND_COOLDOWN_SECONDS,
  type GuardianIssueResult,
  guardianTokenExpiry,
  parseIssueResult,
} from "@/lib/guardian/token";
import { sendMail } from "@/lib/mail/send";
import { guardianConsentMail } from "@/lib/mail/templates/guardian-consent";
import { absoluteUrl } from "@/lib/site";
import { createAdminClient } from "@/lib/supabase/admin";

type Target = { id: string; nickname: string; guardian_email: string; created_at: string };

/**
 * 보호자 동의 메일을 (재)발송한다. 호출 전 권한 검사는 호출자가 한다.
 * 발송 제한 검사·이전 토큰 무효화·새 토큰 저장은 DB 함수 한 번(트랜잭션)으로 처리한다.
 */
export async function sendGuardianConsent(target: Target): Promise<GuardianIssueResult> {
  const expiresAt = guardianTokenExpiry(new Date(target.created_at));
  const { token, tokenHash } = createGuardianToken(expiresAt);

  const { data, error } = await createAdminClient().rpc("issue_guardian_token", {
    p_profile_id: target.id,
    p_token_hash: tokenHash,
    p_expires_at: expiresAt.toISOString(),
    p_cooldown_seconds: GUARDIAN_RESEND_COOLDOWN_SECONDS,
    p_daily_limit: GUARDIAN_DAILY_SEND_LIMIT,
  });
  if (error) return { ok: false, reason: "db_failed" };
  const issued = parseIssueResult(data);
  if (!issued.ok) return issued;

  const consentUrl = absoluteUrl(`/guardian/consent?token=${encodeURIComponent(token)}`);
  const mail = await sendMail(
    guardianConsentMail({
      to: target.guardian_email,
      nickname: target.nickname,
      consentUrl,
      expiresAt,
    }),
  );
  if (mail.ok) return { ok: true };

  await rollbackGuardianToken(target.id, tokenHash);
  return { ok: false, reason: "mail_failed" };
}

/**
 * 메일이 나가지 않은 발급을 되돌린다: 새 토큰 기록을 지워 재발송 횟수에서 빼고,
 * 이번 발급 때 무효화된 이전 토큰을 다시 살린다(이전 메일의 링크를 계속 쓸 수 있게).
 * issue_guardian_token은 한 트랜잭션에서 처리하므로 이전 토큰의 revoked_at = 새 토큰의 created_at이다.
 */
async function rollbackGuardianToken(profileId: string, tokenHash: string): Promise<void> {
  const admin = createAdminClient();
  const { data: removed } = await admin
    .from("guardian_consents")
    .delete()
    .eq("profile_id", profileId)
    .eq("token_hash", tokenHash)
    .select("created_at");
  const issuedAt = removed?.[0]?.created_at;
  if (!issuedAt) return;

  // 그사이 새 토큰이 발급됐다면 유효 토큰 1개 제약(인덱스)에 걸려 갱신되지 않는다. 그 경우는 그대로 둔다.
  await admin
    .from("guardian_consents")
    .update({ revoked_at: null })
    .eq("profile_id", profileId)
    .eq("revoked_at", issuedAt)
    .is("consented_at", null);
}

export function guardianSendErrorMessage(
  result: Exclude<GuardianIssueResult, { ok: true }>,
): string {
  switch (result.reason) {
    case "cooldown":
      return `${result.retryAfterSeconds}초 뒤에 다시 보낼 수 있습니다.`;
    case "daily_limit":
      return "오늘은 더 보낼 수 없습니다. 내일 다시 시도해 주세요.";
    case "expired":
      return "동의 기한(가입 후 7일)이 지나 더 보낼 수 없습니다.";
    case "not_pending":
      return "보호자 동의 대기 상태가 아닙니다.";
    case "mail_failed":
      return "메일을 보내지 못했습니다. 잠시 후 다시 시도해 주세요.";
    default:
      return "처리 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.";
  }
}
