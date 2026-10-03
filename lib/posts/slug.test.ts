import { describe, expect, it } from "vitest";

import { pickUniqueSlug } from "./slug";

describe("pickUniqueSlug", () => {
  it("겹치지 않으면 그대로", () => {
    expect(pickUniqueSlug("lesson-1", new Set(["lesson-2"]))).toBe("lesson-1");
  });

  it("겹치면 -2, -3…을 붙인다", () => {
    expect(pickUniqueSlug("lesson-1", new Set(["lesson-1"]))).toBe("lesson-1-2");
    expect(pickUniqueSlug("lesson-1", new Set(["lesson-1", "lesson-1-2"]))).toBe("lesson-1-3");
  });

  it("50자를 넘지 않게 앞부분을 줄이고 끝의 하이픈을 정리한다", () => {
    const base = `${"a".repeat(47)}-bc`; // 50자
    const result = pickUniqueSlug(base, new Set([base]));
    expect(result.length).toBeLessThanOrEqual(50);
    expect(result).toBe(`${"a".repeat(47)}-2`);
  });
});
