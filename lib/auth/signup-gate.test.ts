import { describe, expect, it } from "vitest";

import { isSignupExemptPath } from "@/lib/auth/signup-gate";

describe("isSignupExemptPath", () => {
  it("가입·로그인·보호자 동의·약관 경로는 가입 전에도 접근할 수 있다", () => {
    for (const path of ["/signup", "/login", "/guardian/consent", "/privacy", "/terms"]) {
      expect(isSignupExemptPath(path)).toBe(true);
    }
  });

  it("그 밖의 경로는 가입을 마쳐야 한다", () => {
    for (const path of ["/", "/me", "/ai-literacy", "/signupx", "/guardianship"]) {
      expect(isSignupExemptPath(path)).toBe(false);
    }
  });
});
