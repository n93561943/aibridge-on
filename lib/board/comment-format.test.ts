import { describe, expect, it } from "vitest";

import { parseComment, parseCommentInline } from "./comment-format";

describe("댓글 인라인 서식", () => {
  it("주소는 링크로, 끝 문장 부호는 뺀다", () => {
    expect(parseCommentInline("참고: https://example.com/a?b=1. 끝")).toEqual([
      { type: "text", text: "참고: " },
      { type: "link", href: "https://example.com/a?b=1" },
      { type: "text", text: ". 끝" },
    ]);
    expect(parseCommentInline("(https://example.com)")).toEqual([
      { type: "text", text: "(" },
      { type: "link", href: "https://example.com" },
      { type: "text", text: ")" },
    ]);
  });

  it("http(s)가 아닌 주소는 링크로 만들지 않는다", () => {
    expect(parseCommentInline("javascript:alert(1) ftp://x")).toEqual([
      { type: "text", text: "javascript:alert(1) ftp://x" },
    ]);
  });

  it("굵게(안의 주소도 링크)와 인라인 코드(안은 그대로)", () => {
    expect(
      parseCommentInline("**중요 https://a.test** 그리고 `**안 굵게** https://b.test`"),
    ).toEqual([
      {
        type: "bold",
        children: [
          { type: "text", text: "중요 " },
          { type: "link", href: "https://a.test" },
        ],
      },
      { type: "text", text: " 그리고 " },
      { type: "code", text: "**안 굵게** https://b.test" },
    ]);
  });

  it("짝이 맞지 않거나 비어 있는 표시는 글자 그대로", () => {
    expect(parseCommentInline("2**3 = 8, ** **, `")).toEqual([
      { type: "text", text: "2**3 = 8, ** **, `" },
    ]);
  });

  it("HTML은 글자 그대로 남긴다", () => {
    expect(parseCommentInline("<img src=x onerror=alert(1)>")).toEqual([
      { type: "text", text: "<img src=x onerror=alert(1)>" },
    ]);
  });
});

describe("댓글 블록", () => {
  it("코드 블록과 문단을 나누고 언어 표시는 버린다", () => {
    expect(parseComment("설명입니다\n```python\nprint(1)\n```\n다음 줄")).toEqual([
      { type: "text", inline: [{ type: "text", text: "설명입니다" }] },
      { type: "code", code: "print(1)" },
      { type: "text", inline: [{ type: "text", text: "다음 줄" }] },
    ]);
  });

  it("줄바꿈은 그대로, 코드 블록 안 서식은 해석하지 않는다", () => {
    expect(parseComment("한 줄\n두 줄")).toEqual([
      { type: "text", inline: [{ type: "text", text: "한 줄\n두 줄" }] },
    ]);
    expect(parseComment("```\n**x** https://a.test\n```")).toEqual([
      { type: "code", code: "**x** https://a.test" },
    ]);
  });

  it("닫히지 않은 코드 블록은 글자 그대로", () => {
    expect(parseComment("```\n열기만")).toEqual([
      { type: "text", inline: [{ type: "text", text: "```\n열기만" }] },
    ]);
  });
});
