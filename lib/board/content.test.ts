import { describe, expect, it } from "vitest";

import {
  boardTitleSchema,
  cleanBoardContent,
  storagePathFromUrl,
  uploadUrlPrefix,
} from "./content";

const PREFIX = uploadUrlPrefix("https://abc.supabase.co/");
const IMG = `${PREFIX}board/u1/x-photo.png`;
const t = (text: string, styles: Record<string, unknown> = {}) => ({ type: "text", text, styles });
const block = (type: string, extra: Record<string, unknown> = {}) => ({
  id: `b-${type}`,
  type,
  props: {},
  content: [],
  children: [],
  ...extra,
});

describe("업로드 주소", () => {
  it("사이트 버킷 주소에서 경로를 뽑는다", () => {
    expect(PREFIX).toBe("https://abc.supabase.co/storage/v1/object/public/post-files/");
    expect(storagePathFromUrl(IMG, PREFIX)).toBe("board/u1/x-photo.png");
  });

  it("다른 주소·경로 조작은 거부한다", () => {
    expect(storagePathFromUrl("https://evil.test/a.png", PREFIX)).toBeNull();
    expect(storagePathFromUrl(`${PREFIX}board/../secret.png`, PREFIX)).toBeNull();
    expect(storagePathFromUrl(`${PREFIX}board/%2e%2e/secret.png`, PREFIX)).toBeNull();
    expect(storagePathFromUrl(`${PREFIX}board/u1/a.png?x=1`, PREFIX)).toBeNull();
    expect(storagePathFromUrl(PREFIX, PREFIX)).toBeNull();
  });
});

describe("제목", () => {
  it("1~300자, 앞뒤 공백 제거", () => {
    expect(boardTitleSchema.parse("  안녕  ")).toBe("안녕");
    expect(boardTitleSchema.safeParse("   ").success).toBe(false);
    expect(boardTitleSchema.safeParse("가".repeat(300)).success).toBe(true);
    expect(boardTitleSchema.safeParse("가".repeat(301)).success).toBe(false);
  });
});

describe("본문 정리", () => {
  it("허용한 블록·서식만 남기고 평문·이미지 경로를 만든다", () => {
    const result = cleanBoardContent(
      [
        block("paragraph", {
          props: { textColor: "red", backgroundColor: "blue", textAlignment: "center" },
          content: [
            t("굵게", { bold: true, italic: true, textColor: "red" }),
            t(" 코드", { code: true }),
            { type: "link", href: "https://example.com", content: [t("링크", { bold: true })] },
          ],
        }),
        block("numberedListItem", {
          props: { start: 3 },
          content: [t("하나")],
          children: [block("bulletListItem", { id: "nested", content: [t("안쪽")] })],
        }),
        block("codeBlock", {
          props: { language: "python" },
          content: [t("print(1)", { bold: true })],
        }),
        block("image", { props: { url: IMG, caption: "사진", onerror: "x" }, content: undefined }),
      ],
      PREFIX,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const [p, ol, code, img] = result.content;
    expect(p.props).toEqual({
      textColor: "default",
      backgroundColor: "default",
      textAlignment: "left",
    });
    expect(p.content).toEqual([
      t("굵게", { bold: true }),
      t(" 코드", { code: true }),
      { type: "link", href: "https://example.com", content: [t("링크", { bold: true })] },
    ]);
    expect(ol.props.start).toBe(3);
    expect(ol.children[0].type).toBe("bulletListItem");
    expect(code.content).toEqual([t("print(1)")]);
    expect(img.props).toMatchObject({ url: IMG, caption: "사진" });
    expect(img.props).not.toHaveProperty("onerror");
    expect(result.imagePaths).toEqual(["board/u1/x-photo.png"]);
    expect(result.contentText).toBe("굵게 코드링크\n하나\n안쪽\nprint(1)\n사진");
  });

  it("앞뒤 빈 문단은 지우고, 빈 본문도 허용한다", () => {
    const empty = cleanBoardContent([block("paragraph"), block("paragraph")], PREFIX);
    expect(empty).toEqual({ ok: true, content: [], contentText: "", imagePaths: [] });
    const result = cleanBoardContent(
      [block("paragraph"), block("paragraph", { content: [t("내용")] }), block("paragraph")],
      PREFIX,
    );
    expect(result.ok && result.content).toHaveLength(1);
  });

  it.each([
    ["허용하지 않는 블록", [block("heading")], "게시판에서 쓸 수 없는 블록"],
    ["교사 전용 박스", [block("teacherBox")], "게시판에서 쓸 수 없는 블록"],
    ["외부 이미지", [block("image", { props: { url: "https://evil.test/a.png" } })], "외부 이미지"],
    ["빈 이미지 블록", [block("image", { props: { url: "" } })], "이미지를 올리지 않은"],
    [
      "javascript: 링크",
      [
        block("paragraph", {
          content: [{ type: "link", href: "javascript:alert(1)", content: [t("x")] }],
        }),
      ],
      "링크 주소",
    ],
    ["문단 아래 블록", [block("paragraph", { children: [block("paragraph")] })], "들여쓰기"],
    ["모르는 인라인 요소", [block("paragraph", { content: [{ type: "mention" }] })], "형식"],
  ])("%s는 거부한다", (_, content, message) => {
    const result = cleanBoardContent(content, PREFIX);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain(message);
  });

  it("목록은 4단계까지만 들여쓴다", () => {
    const nest = (depth: number): ReturnType<typeof block> =>
      block("bulletListItem", { children: depth ? [nest(depth - 1)] : [] });
    expect(cleanBoardContent([nest(4)], PREFIX).ok).toBe(true);
    expect(cleanBoardContent([nest(5)], PREFIX).ok).toBe(false);
  });

  it("배열이 아니거나 너무 크면 거부한다", () => {
    expect(cleanBoardContent({}, PREFIX).ok).toBe(false);
    const big = [block("paragraph", { content: [t("가".repeat(100_001))] })];
    expect(cleanBoardContent(big, PREFIX)).toEqual({ ok: false, message: "본문이 너무 깁니다." });
  });

  it("코드 블록 언어는 안전한 이름만", () => {
    const result = cleanBoardContent(
      [block("codeBlock", { props: { language: "<script>" } })],
      PREFIX,
    );
    expect(result.ok && result.content[0].props.language).toBe("text");
  });
});
