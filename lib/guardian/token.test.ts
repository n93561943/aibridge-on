import { describe, expect, it } from "vitest";

import {
  createGuardianToken,
  evaluateGuardianToken,
  GUARDIAN_RESEND_COOLDOWN_SECONDS,
  GUARDIAN_TOKEN_TTL_DAYS,
  guardianTokenExpiry,
  hashGuardianToken,
  parseIssueResult,
} from "@/lib/guardian/token";

const now = new Date("2026-10-01T00:00:00Z");
const DAY = 24 * 60 * 60 * 1000;

describe("createGuardianToken", () => {
  const expiresAt = new Date(now.getTime() + DAY);

  it("원문 토큰과 다른 해시를 만들고 해시는 재현 가능하다", () => {
    const { token, tokenHash } = createGuardianToken(expiresAt);
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(tokenHash).not.toContain(token);
    expect(hashGuardianToken(token)).toBe(tokenHash);
  });

  it("매번 다른 토큰을 만든다", () => {
    expect(createGuardianToken(expiresAt).token).not.toBe(createGuardianToken(expiresAt).token);
  });
});

describe("guardianTokenExpiry", () => {
  it("가입 직후 발송이면 7일 뒤 만료", () => {
    expect(guardianTokenExpiry(now, now).getTime() - now.getTime()).toBe(
      GUARDIAN_TOKEN_TTL_DAYS * DAY,
    );
  });

  it("재발송해도 계정 삭제 시점(가입 + 7일)을 넘지 않는다", () => {
    const createdAt = new Date(now.getTime() - 6 * DAY);
    expect(guardianTokenExpiry(createdAt, now)).toEqual(
      new Date(createdAt.getTime() + GUARDIAN_TOKEN_TTL_DAYS * DAY),
    );
  });

  it("삭제 기한이 이미 지났으면 과거 시각(= 발송 불가)", () => {
    const createdAt = new Date(now.getTime() - 8 * DAY);
    expect(guardianTokenExpiry(createdAt, now).getTime()).toBeLessThan(now.getTime());
  });
});

describe("evaluateGuardianToken", () => {
  const base = {
    expires_at: new Date(now.getTime() + DAY).toISOString(),
    consented_at: null,
    revoked_at: null,
  };

  it("기록이 없으면 not_found", () => {
    expect(evaluateGuardianToken(null, now)).toBe("not_found");
  });

  it("미사용·미만료면 valid", () => {
    expect(evaluateGuardianToken(base, now)).toBe("valid");
  });

  it("이미 동의한 토큰은 재사용할 수 없다(1회용)", () => {
    expect(evaluateGuardianToken({ ...base, consented_at: now.toISOString() }, now)).toBe("used");
  });

  it("재발송으로 무효화된 토큰은 revoked", () => {
    expect(evaluateGuardianToken({ ...base, revoked_at: now.toISOString() }, now)).toBe("revoked");
  });

  it("만료 시각이 지나면 expired", () => {
    expect(evaluateGuardianToken({ ...base, expires_at: now.toISOString() }, now)).toBe("expired");
  });
});

describe("parseIssueResult", () => {
  it("ok", () => {
    expect(parseIssueResult("ok")).toEqual({ ok: true });
  });

  it("cooldown:<초>를 남은 시간으로 해석한다", () => {
    expect(parseIssueResult("cooldown:42")).toEqual({
      ok: false,
      reason: "cooldown",
      retryAfterSeconds: 42,
    });
    expect(parseIssueResult("cooldown:abc")).toMatchObject({
      retryAfterSeconds: GUARDIAN_RESEND_COOLDOWN_SECONDS,
    });
  });

  it("한도·기한·상태 오류를 구분하고 알 수 없는 값은 db_failed", () => {
    expect(parseIssueResult("daily_limit")).toEqual({ ok: false, reason: "daily_limit" });
    expect(parseIssueResult("expired")).toEqual({ ok: false, reason: "expired" });
    expect(parseIssueResult("not_pending")).toEqual({ ok: false, reason: "not_pending" });
    expect(parseIssueResult(null)).toEqual({ ok: false, reason: "db_failed" });
  });
});
