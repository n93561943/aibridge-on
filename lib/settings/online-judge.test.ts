import { describe, expect, it } from "vitest";

import { buildJudgeUrl } from "./online-judge";

describe("buildJudgeUrl", () => {
  const template = "https://judge.example.com/problem/{id}";

  it("문제 번호를 넣어 주소를 만든다", () => {
    expect(buildJudgeUrl(template, "1001")).toBe("https://judge.example.com/problem/1001");
    expect(buildJudgeUrl("https://j.example.com/p?id={id}", "A-3")).toBe(
      "https://j.example.com/p?id=A-3",
    );
  });

  it("설정이 없거나 형식이 틀리면 null(버튼 비활성)", () => {
    expect(buildJudgeUrl(null, "1001")).toBeNull();
    expect(buildJudgeUrl("", "1001")).toBeNull();
    expect(buildJudgeUrl("https://judge.example.com/problem/", "1001")).toBeNull();
    expect(buildJudgeUrl("javascript:alert({id})", "1")).toBeNull();
  });

  it("문제 번호에 이상한 글자가 있으면 null", () => {
    expect(buildJudgeUrl(template, "")).toBeNull();
    expect(buildJudgeUrl(template, "../admin")).toBeNull();
    expect(buildJudgeUrl(template, "1 2")).toBeNull();
    expect(buildJudgeUrl(template, "x".repeat(21))).toBeNull();
  });
});
