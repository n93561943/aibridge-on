import "server-only";

import { canSendGuardianMail, createGuardianToken } from "@/lib/guardian/token";
import { sendMail } from "@/lib/mail/send";
import { guardianConsentMail } from "@/lib/mail/templates/guardian-consent";
import { absoluteUrl } from "@/lib/site";
import { createAdminClient } from "@/lib/supabase/admin";

export type SendGuardianResult =
  | { ok: true }
  | { ok: false; reason: "cooldown"; retryAfterSeconds: number }
  | { ok: false; reason: "daily_limit" | "mail_failed" | "db_failed" };

type Target = { id: string; nickname: string; guardian_email: string };

/**
 * 보호자 동의 메일을 (재)발송한다.
 * 이전에 보낸 미사용 토큰은 무효화하고 새 토큰을 만든다. 호출 전 권한 검사는 호출자가 한다.
 */
export async function sendGuardianConsent(target: Target): Promise<SendGuardianResult> {
  const admin = createAdminClient();
  const now = new Date();

  const { data: recent, error: recentError } = await admin
    .from("guardian_consents")
    .select("created_at")
    .eq("profile_id", target.id)
    .gte("created_at", new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString());
  if (recentError) return { ok: false, reason: "db_failed" };

  const decision = canSendGuardianMail(
    (recent ?? []).map((r) => new Date(r.created_at)),
    now,
  );
  if (!decision.ok) return decision;

  const { error: revokeError } = await admin
    .from("guardian_consents")
    .update({ revoked_at: now.toISOString() })
    .eq("profile_id", target.id)
    .is("consented_at", null)
    .is("revoked_at", null);
  if (revokeError) return { ok: false, reason: "db_failed" };

  const { token, tokenHash, expiresAt } = createGuardianToken(now);
  const { error: insertError } = await admin.from("guardian_consents").insert({
    profile_id: target.id,
    guardian_email: target.guardian_email,
    token_hash: tokenHash,
    expires_at: expiresAt.toISOString(),
  });
  if (insertError) return { ok: false, reason: "db_failed" };

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
  result: Exclude<SendGuardianResult, { ok: true }>,
): string {
  switch (result.reason) {
    case "cooldown":
      return `${result.retryAfterSeconds}초 뒤에 다시 보낼 수 있습니다.`;
    case "daily_limit":
      return "오늘은 더 보낼 수 없습니다. 내일 다시 시도해 주세요.";
    case "mail_failed":
      return "메일을 보내지 못했습니다. 잠시 후 다시 시도해 주세요.";
    default:
      return "처리 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.";
  }
}
