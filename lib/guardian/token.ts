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
export function createGuardianToken(expiresAt: Date) {
  const token = randomToken(32);
  return { token, tokenHash: hashGuardianToken(token), expiresAt };
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

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * 동의 링크 만료 시각 = min(발송 시각 + 7일, 가입 시각 + 7일).
 * 계정은 가입 7일 뒤 자동 삭제되므로(purge_expired_accounts), 재발송 링크도 그보다 오래 유효하면 안 된다.
 */
export function guardianTokenExpiry(profileCreatedAt: Date, now = new Date()): Date {
  const ttl = GUARDIAN_TOKEN_TTL_DAYS * DAY_MS;
  return new Date(Math.min(now.getTime() + ttl, profileCreatedAt.getTime() + ttl));
}

export type GuardianIssueResult =
  | { ok: true }
  | { ok: false; reason: "cooldown"; retryAfterSeconds: number }
  | { ok: false; reason: "daily_limit" | "expired" | "not_pending" | "db_failed" | "mail_failed" };

/** DB 함수 issue_guardian_token의 반환 문자열을 해석한다. */
export function parseIssueResult(value: unknown): GuardianIssueResult {
  if (value === "ok") return { ok: true };
  if (typeof value === "string" && value.startsWith("cooldown:")) {
    const seconds = Number(value.slice("cooldown:".length));
    return {
      ok: false,
      reason: "cooldown",
      retryAfterSeconds: Number.isFinite(seconds)
        ? Math.max(1, seconds)
        : GUARDIAN_RESEND_COOLDOWN_SECONDS,
    };
  }
  if (value === "daily_limit" || value === "expired" || value === "not_pending") {
    return { ok: false, reason: value };
  }
  return { ok: false, reason: "db_failed" };
}
