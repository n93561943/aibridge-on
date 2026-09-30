import { describe, expect, it } from "vitest";

import { emailSchema, isAdminEmail } from "@/lib/auth/email";
import { isOtpLocked, OTP_MAX_FAILURES, remainingOtpAttempts } from "@/lib/auth/otp-policy";
import { safeNextPath } from "@/lib/auth/redirect";
import { SESSION_MAX_AGE_SECONDS, withSessionMaxAge } from "@/lib/auth/session";

describe("isAdminEmail", () => {
  const admins = ["admin@example.com", "boss@school.kr"];

  it("대소문자·앞뒤 공백과 관계없이 관리자 이메일을 인식한다", () => {
    expect(isAdminEmail("  Admin@Example.COM ", admins)).toBe(true);
    expect(isAdminEmail("boss@school.kr", admins)).toBe(true);
  });

  it("목록에 없거나 목록이 비어 있으면 false", () => {
    expect(isAdminEmail("student@example.com", admins)).toBe(false);
    expect(isAdminEmail("admin@example.com", [])).toBe(false);
  });
});

describe("emailSchema", () => {
  it("소문자로 정규화한다", () => {
    expect(emailSchema.parse(" User@Example.com ")).toBe("user@example.com");
  });

  it("형식이 잘못되면 거부한다", () => {
    expect(emailSchema.safeParse("not-an-email").success).toBe(false);
    expect(emailSchema.safeParse("").success).toBe(false);
  });
});

describe("OTP 오류 제한", () => {
  const issued = new Date().toISOString();

  it("기록이 없으면 잠기지 않고 5회 남는다", () => {
    expect(isOtpLocked(null)).toBe(false);
    expect(remainingOtpAttempts(null)).toBe(OTP_MAX_FAILURES);
  });

  it("4회 오류까지는 검증할 수 있다", () => {
    const record = { fail_count: 4, issued_at: issued };
    expect(isOtpLocked(record)).toBe(false);
    expect(remainingOtpAttempts(record)).toBe(1);
  });

  it("5회 오류면 해당 코드는 무효", () => {
    const record = { fail_count: 5, issued_at: issued };
    expect(isOtpLocked(record)).toBe(true);
    expect(remainingOtpAttempts(record)).toBe(0);
  });
});

describe("safeNextPath", () => {
  it("사이트 내부 경로는 허용한다", () => {
    expect(safeNextPath("/me")).toBe("/me");
    expect(safeNextPath("/ai-literacy/lesson-1?tab=2")).toBe("/ai-literacy/lesson-1?tab=2");
  });

  it("외부 주소·프로토콜 상대 주소·역슬래시는 거부한다", () => {
    expect(safeNextPath("https://evil.com")).toBe("/");
    expect(safeNextPath("//evil.com")).toBe("/");
    expect(safeNextPath("/\\evil.com")).toBe("/");
    expect(safeNextPath("/foo\\bar")).toBe("/");
    expect(safeNextPath("javascript:alert(1)")).toBe("/");
  });

  it("값이 없거나 로그인·가입 화면이면 기본값", () => {
    expect(safeNextPath(undefined)).toBe("/");
    expect(safeNextPath(null, "/me")).toBe("/me");
    expect(safeNextPath("/login")).toBe("/");
    expect(safeNextPath("/signup?x=1")).toBe("/");
  });
});

describe("withSessionMaxAge", () => {
  it("400일 쿠키를 30일로 줄인다", () => {
    expect(withSessionMaxAge({ maxAge: 400 * 24 * 60 * 60, path: "/" })).toEqual({
      maxAge: SESSION_MAX_AGE_SECONDS,
      path: "/",
    });
  });

  it("삭제용(maxAge 0)·옵션 없음은 그대로 둔다", () => {
    expect(withSessionMaxAge({ maxAge: 0 })).toEqual({ maxAge: 0 });
    expect(withSessionMaxAge(undefined)).toBeUndefined();
    expect(withSessionMaxAge({ path: "/", maxAge: undefined })).toEqual({
      path: "/",
      maxAge: undefined,
    });
  });
});
