import { describe, expect, it } from "vitest";

import { maskEmail } from "@/lib/privacy";

describe("maskEmail", () => {
  it("앞 2글자만 보이고 나머지는 가린다", () => {
    expect(maskEmail("student@example.com")).toBe("st*****@example.com");
  });

  it("아주 짧은 주소도 최소 1글자는 가린다", () => {
    expect(maskEmail("ab@example.com")).toBe("a*@example.com");
    expect(maskEmail("a@example.com")).toBe("a*@example.com");
  });

  it("형식이 이상하면 전체를 가린다", () => {
    expect(maskEmail("no-at-sign")).toBe("***");
    expect(maskEmail("@example.com")).toBe("***");
  });
});
