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
  return mail.ok ? { ok: true } : { ok: false, reason: "mail_failed" };
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
