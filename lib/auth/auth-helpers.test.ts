import { describe, expect, it } from "vitest";

import { emailSchema, isAdminEmail } from "@/lib/auth/email";
import {
  isAuthServiceError,
  isOverOtpLimit,
  OTP_MAX_FAILURES,
  remainingOtpAttempts,
} from "@/lib/auth/otp-policy";
import { safeNextPath } from "@/lib/auth/redirect";
import { isSessionExpired, SESSION_MAX_AGE_SECONDS, withSessionMaxAge } from "@/lib/auth/session";

describe("isSessionExpired", () => {
  const now = new Date("2026-10-31T00:00:00Z");
  const daysAgo = (d: number) => new Date(now.getTime() - d * 24 * 60 * 60 * 1000).toISOString();

  it("로그인 후 30일 이내면 유지", () => {
    expect(isSessionExpired(daysAgo(0), now)).toBe(false);
    expect(isSessionExpired(daysAgo(30), now)).toBe(false);
  });

  it("30일이 지나면 만료", () => {
    expect(isSessionExpired(daysAgo(30.01), now)).toBe(true);
    expect(isSessionExpired(daysAgo(90), now)).toBe(true);
  });

  it("로그인 시각을 모르면 만료로 보지 않는다", () => {
    expect(isSessionExpired(null, now)).toBe(false);
    expect(isSessionExpired("not-a-date", now)).toBe(false);
  });
});

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

describe("OTP 오류 제한(검증 전 차감 방식)", () => {
  it("1~5번째 시도는 검증한다", () => {
    for (let attempts = 1; attempts <= OTP_MAX_FAILURES; attempts++) {
      expect(isOverOtpLimit(attempts)).toBe(false);
    }
  });

  it("6번째 시도부터는 검증하지 않는다(코드 무효)", () => {
    expect(isOverOtpLimit(OTP_MAX_FAILURES + 1)).toBe(true);
    expect(isOverOtpLimit(50)).toBe(true);
  });

  it("실패 후 남은 횟수: 1번째 실패면 4회, 5번째 실패면 0회", () => {
    expect(remainingOtpAttempts(1)).toBe(4);
    expect(remainingOtpAttempts(5)).toBe(0);
    expect(remainingOtpAttempts(9)).toBe(0);
  });

  it("요청 과다(429)·서버 오류(5xx)는 코드 오류로 세지 않는다", () => {
    expect(isAuthServiceError(429)).toBe(true);
    expect(isAuthServiceError(503)).toBe(true);
    expect(isAuthServiceError(400)).toBe(false);
    expect(isAuthServiceError(403)).toBe(false);
    expect(isAuthServiceError(undefined)).toBe(false);
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
