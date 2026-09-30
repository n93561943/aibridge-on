import { randomToken, sha256Hex } from "@/lib/hash";

/** 보호자 동의 링크 유효기간(F-02: 7일). 계정 자동 삭제 기간과 같다. */
export const GUARDIAN_TOKEN_TTL_DAYS = 7;
/** 동의 메일 재발송 간격과 하루 최대 발송 횟수 */
export const GUARDIAN_RESEND_COOLDOWN_SECONDS = 60;
export const GUARDIAN_DAILY_SEND_LIMIT = 5;

export function hashGuardianToken(token: string): string {
  return sha256Hex(`guardian:${token}`);
}

/** 원문 토큰은 메일 링크에만 쓰고 DB에는 해시만 저장한다. */
export function createGuardianToken(now = new Date()) {
  const token = randomToken(32);
  return {
    token,
    tokenHash: hashGuardianToken(token),
    expiresAt: new Date(now.getTime() + GUARDIAN_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000),
  };
}

export type GuardianConsentRecord = {
  expires_at: string;
  consented_at: string | null;
  revoked_at: string | null;
};

export type GuardianTokenState = "valid" | "not_found" | "expired" | "used" | "revoked";

export function evaluateGuardianToken(
  record: GuardianConsentRecord | null,
  now = new Date(),
): GuardianTokenState {
  if (!record) return "not_found";
  if (record.consented_at) return "used";
  if (record.revoked_at) return "revoked";
  if (new Date(record.expires_at).getTime() <= now.getTime()) return "expired";
  return "valid";
}

export type GuardianResendDecision =
  | { ok: true }
  | { ok: false; reason: "cooldown"; retryAfterSeconds: number }
  | { ok: false; reason: "daily_limit" };

/** 최근 발송 시각 목록으로 재발송 가능 여부를 판단한다. */
export function canSendGuardianMail(sentAt: Date[], now = new Date()): GuardianResendDecision {
  const dayAgo = now.getTime() - 24 * 60 * 60 * 1000;
  const recent = sentAt.filter((d) => d.getTime() > dayAgo);
  if (recent.length >= GUARDIAN_DAILY_SEND_LIMIT) return { ok: false, reason: "daily_limit" };
  const last = Math.max(0, ...recent.map((d) => d.getTime()));
  const elapsed = Math.floor((now.getTime() - last) / 1000);
  if (last > 0 && elapsed < GUARDIAN_RESEND_COOLDOWN_SECONDS) {
    return {
      ok: false,
      reason: "cooldown",
      retryAfterSeconds: GUARDIAN_RESEND_COOLDOWN_SECONDS - elapsed,
    };
  }
  return { ok: true };
}
