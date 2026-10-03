import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { Block } from "@/lib/posts/content";

import { PostContent } from "./post-content";

let n = 0;
const block = (type: string, extra: Partial<Block> = {}): Block => ({
  id: `b${++n}`,
  type,
  props: {},
  content: [],
  children: [],
  ...extra,
});
const text = (t: string, styles = {}) => [{ type: "text", text: t, styles }];

function renderBlocks(blocks: Block[], judgeUrlTemplate: string | null = null) {
  return render(<PostContent blocks={blocks} judgeUrlTemplate={judgeUrlTemplate} />);
}

describe("PostContent", () => {
  it("이어진 목록 항목을 하나의 목록으로 묶고, 하위 항목은 안쪽 목록으로", () => {
    renderBlocks([
      block("bulletListItem", { content: text("가") }),
      block("bulletListItem", {
        content: text("나"),
        children: [block("bulletListItem", { content: text("나-1") })],
      }),
      block("paragraph", { content: text("문단") }),
      block("numberedListItem", { content: text("첫째") }),
      block("numberedListItem", { content: text("둘째") }),
    ]);
    const lists = screen.getAllByRole("list");
    expect(lists).toHaveLength(3); // ul(가·나), 안쪽 ul(나-1), ol
    expect(lists[0].tagName).toBe("UL");
    expect(lists[0].querySelectorAll(":scope > li")).toHaveLength(2);
    expect(screen.getByText("첫째").closest("ol")).not.toBeNull();
  });

  it("본문 제목은 한 단계 내린다(페이지 제목이 h1)", () => {
    renderBlocks([block("heading", { props: { level: 1 }, content: text("학습 목표") })]);
    expect(screen.getByRole("heading", { level: 2, name: "학습 목표" })).toBeInTheDocument();
  });

  it("굵게·코드 서식과 안전한 링크만 그린다", () => {
    renderBlocks([
      block("paragraph", {
        content: [
          ...text("굵게", { bold: true }),
          ...text("print()", { code: true }),
          { type: "link", href: "https://example.com", content: text("좋은 링크") },
          { type: "link", href: "javascript:alert(1)", content: text("나쁜 링크") },
        ],
      }),
    ]);
    expect(screen.getByText("굵게")).toHaveClass("font-semibold");
    expect(screen.getByText("print()").tagName).toBe("CODE");
    const good = screen.getByRole("link", { name: "좋은 링크" });
    expect(good).toHaveAttribute("href", "https://example.com");
    expect(good).toHaveAttribute("rel", "noopener noreferrer");
    expect(screen.queryByRole("link", { name: "나쁜 링크" })).toBeNull();
    expect(screen.getByText("나쁜 링크")).toBeInTheDocument();
  });

  it("정해진 색 이름만 스타일로 바꾼다", () => {
    renderBlocks([
      block("paragraph", { content: text("빨강", { textColor: "red" }) }),
      block("paragraph", { content: text("주입", { textColor: "red;background:url(x)" }) }),
    ]);
    expect(screen.getByText("빨강")).toHaveStyle({ color: "#dc2626" });
    expect(screen.getByText("주입").getAttribute("style")).toBeNull();
  });

  it("이미지·파일은 http(s) 주소만, 캡션을 대체 텍스트로", () => {
    renderBlocks([
      block("image", {
        props: { url: "https://x.supabase.co/a.png", caption: "실험 사진" },
        content: undefined,
      }),
      block("image", {
        props: { url: "javascript:alert(1)", caption: "나쁨" },
        content: undefined,
      }),
      block("file", {
        props: { url: "https://x.supabase.co/w.hwp", name: "활동지.hwp" },
        content: undefined,
      }),
    ]);
    expect(screen.getByRole("img", { name: "실험 사진" })).toHaveAttribute(
      "src",
      "https://x.supabase.co/a.png",
    );
    expect(screen.queryByRole("img", { name: "나쁨" })).toBeNull();
    expect(screen.getByRole("link", { name: "활동지.hwp" })).toHaveAttribute(
      "href",
      "https://x.supabase.co/w.hwp",
    );
  });

  it("YouTube는 youtube-nocookie로, 잘못된 영상 ID는 그리지 않는다", () => {
    const { container } = renderBlocks([
      block("youtube", {
        props: { videoId: "dQw4w9WgXcQ", caption: "소개 영상" },
        content: undefined,
      }),
      block("youtube", { props: { videoId: '"><script>' }, content: undefined }),
    ]);
    const frames = container.querySelectorAll("iframe");
    expect(frames).toHaveLength(1);
    expect(frames[0].getAttribute("src")).toBe(
      "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ",
    );
  });

  it("온라인 저지 버튼: 주소 형식이 없으면 준비 중, 있으면 링크", () => {
    const judge = block("judgeLink", {
      props: { problemId: "1001", label: "" },
      content: undefined,
    });
    const { unmount } = renderBlocks([judge]);
    expect(screen.getByText("1001번 문제 풀기 (준비 중)")).toBeInTheDocument();
    expect(screen.queryByRole("link")).toBeNull();
    unmount();

    renderBlocks([judge], "https://judge.example.com/problem/{id}");
    expect(screen.getByRole("link", { name: /1001번 문제 풀기/ })).toHaveAttribute(
      "href",
      "https://judge.example.com/problem/1001",
    );
  });

  it("표: 머리글 행은 th로", () => {
    renderBlocks([
      block("table", {
        content: {
          type: "tableContent",
          headerRows: 1,
          rows: [
            { cells: [{ type: "tableCell", props: {}, content: text("이름") }] },
            { cells: [{ type: "tableCell", props: {}, content: text("홍길동") }] },
          ],
        },
      }),
    ]);
    expect(screen.getByRole("columnheader", { name: "이름" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "홍길동" })).toBeInTheDocument();
  });

  it("교사 전용 박스가 남아 있으면(교사에게 보낼 때) 표시를 붙여 그린다", () => {
    renderBlocks([
      block("teacherBox", {
        content: text("정답"),
        children: [block("paragraph", { content: text("42") })],
      }),
    ]);
    expect(screen.getByRole("region", { name: "교사 전용" })).toHaveTextContent("42");
  });
});
