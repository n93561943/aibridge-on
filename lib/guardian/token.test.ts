import { describe, expect, it } from "vitest";

import {
  canSendGuardianMail,
  createGuardianToken,
  evaluateGuardianToken,
  GUARDIAN_DAILY_SEND_LIMIT,
  GUARDIAN_TOKEN_TTL_DAYS,
  hashGuardianToken,
} from "@/lib/guardian/token";

const now = new Date("2026-10-01T00:00:00Z");
const DAY = 24 * 60 * 60 * 1000;

describe("createGuardianToken", () => {
  it("원문 토큰과 다른 해시를 만들고 해시는 재현 가능하다", () => {
    const { token, tokenHash } = createGuardianToken(now);
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(tokenHash).not.toContain(token);
    expect(hashGuardianToken(token)).toBe(tokenHash);
  });

  it("매번 다른 토큰을 만든다", () => {
    expect(createGuardianToken(now).token).not.toBe(createGuardianToken(now).token);
  });

  it("유효기간은 7일", () => {
    const { expiresAt } = createGuardianToken(now);
    expect(expiresAt.getTime() - now.getTime()).toBe(GUARDIAN_TOKEN_TTL_DAYS * DAY);
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

describe("canSendGuardianMail", () => {
  it("발송 이력이 없으면 가능", () => {
    expect(canSendGuardianMail([], now)).toEqual({ ok: true });
  });

  it("마지막 발송 후 60초 안에는 남은 시간을 알려 준다", () => {
    const result = canSendGuardianMail([new Date(now.getTime() - 20_000)], now);
    expect(result).toEqual({ ok: false, reason: "cooldown", retryAfterSeconds: 40 });
  });

  it("24시간 안에 5회 보냈으면 하루 한도 초과", () => {
    const sent = Array.from(
      { length: GUARDIAN_DAILY_SEND_LIMIT },
      (_, i) => new Date(now.getTime() - (i + 1) * 60 * 60 * 1000),
    );
    expect(canSendGuardianMail(sent, now)).toEqual({ ok: false, reason: "daily_limit" });
  });

  it("24시간이 지난 발송은 한도에 넣지 않는다", () => {
    const sent = Array.from(
      { length: GUARDIAN_DAILY_SEND_LIMIT },
      (_, i) => new Date(now.getTime() - DAY - (i + 1) * 1000),
    );
    expect(canSendGuardianMail(sent, now)).toEqual({ ok: true });
  });
});
