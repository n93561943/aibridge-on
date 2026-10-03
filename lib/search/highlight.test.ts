import { describe, expect, it } from "vitest";

import { highlightParts } from "./highlight";

describe("highlightParts", () => {
  it("일치하는 부분을 모두 표시한다(대소문자 무시)", () => {
    expect(highlightParts("Python과 python 반복문", "PYTHON")).toEqual([
      { text: "Python", match: true },
      { text: "과 ", match: false },
      { text: "python", match: true },
      { text: " 반복문", match: false },
    ]);
  });

  it("한국어 부분 일치", () => {
    expect(highlightParts("인공지능 윤리", "지능")).toEqual([
      { text: "인공", match: false },
      { text: "지능", match: true },
      { text: " 윤리", match: false },
    ]);
  });

  it("정규식 특수 문자도 글자 그대로", () => {
    expect(highlightParts("a.b(c) a*b", "(c)")).toEqual([
      { text: "a.b", match: false },
      { text: "(c)", match: true },
      { text: " a*b", match: false },
    ]);
  });

  it("검색어가 없거나 일치하지 않으면 그대로", () => {
    expect(highlightParts("본문", "")).toEqual([{ text: "본문", match: false }]);
    expect(highlightParts("본문", "없음")).toEqual([{ text: "본문", match: false }]);
    expect(highlightParts("", "a")).toEqual([]);
  });
});
