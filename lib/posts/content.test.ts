import { describe, expect, it } from "vitest";

import { MAX_IMAGE_BYTES, resolveMimeType, storageSafeName, uploadError } from "./constants";
import {
  type Block,
  extractPlainText,
  parseYouTubeId,
  postContentSchema,
  stripTeacherOnlyBlocks,
} from "./content";

let n = 0;
function block(type: string, extra: Partial<Block> = {}): Block {
  n += 1;
  return { id: `b${n}`, type, props: {}, content: [], children: [], ...extra };
}
const text = (t: string) => [{ type: "text", text: t, styles: {} }];

describe("postContentSchema", () => {
  it("BlockNote 기본·커스텀 블록을 받는다", () => {
    const doc = [
      block("heading", { props: { level: 2 }, content: text("제목") }),
      block("paragraph", {
        content: [
          ...text("본문 "),
          { type: "link", href: "https://example.com", content: text("링크") },
        ],
      }),
      block("codeBlock", { props: { language: "python" }, content: text("print(1)") }),
      block("image", {
        props: { url: "https://x.supabase.co/a.png", caption: "그림" },
        content: undefined,
      }),
      block("youtube", { props: { videoId: "dQw4w9WgXcQ" }, content: undefined }),
      block("callout", { props: { tone: "tip" }, content: text("팁") }),
    ];
    expect(postContentSchema.safeParse(doc).success).toBe(true);
  });

  it("허용하지 않은 블록(오디오·동영상·알 수 없는 것)은 거부한다", () => {
    for (const type of ["audio", "video", "script"]) {
      expect(postContentSchema.safeParse([block(type)]).success, type).toBe(false);
    }
  });

  it("javascript: 링크와 이미지 주소를 거부한다", () => {
    const badLink = block("paragraph", {
      content: [{ type: "link", href: "javascript:alert(1)", content: text("x") }],
    });
    expect(postContentSchema.safeParse([badLink]).error?.issues[0].message).toContain("링크 주소");

    const badImage = block("image", { props: { url: "javascript:alert(1)" }, content: undefined });
    expect(postContentSchema.safeParse([badImage]).success).toBe(false);

    const dataImage = block("image", {
      props: { url: "data:image/png;base64,AAA" },
      content: undefined,
    });
    expect(postContentSchema.safeParse([dataImage]).success).toBe(false);
  });

  it("하위 블록 안의 위험한 링크도 찾는다", () => {
    const nested = block("bulletListItem", {
      content: text("부모"),
      children: [
        block("paragraph", {
          content: [{ type: "link", href: "vbscript:x", content: text("x") }],
        }),
      ],
    });
    expect(postContentSchema.safeParse([nested]).success).toBe(false);
  });

  it("너무 큰 본문·깊은 들여쓰기를 거부한다", () => {
    const huge = [block("paragraph", { content: text("가".repeat(1_000_001)) })];
    expect(postContentSchema.safeParse(huge).success).toBe(false);

    let deep = block("paragraph");
    for (let i = 0; i < 9; i++) deep = block("bulletListItem", { children: [deep] });
    expect(postContentSchema.safeParse([deep]).success).toBe(false);
  });
});

describe("extractPlainText", () => {
  it("문단·목록·표·캡션 글자를 줄 단위로 뽑는다", () => {
    const doc = [
      block("heading", { content: text("인공지능이란") }),
      block("bulletListItem", {
        content: text("항목 1"),
        children: [block("bulletListItem", { content: text("하위 항목") })],
      }),
      block("paragraph", {
        content: [...text("자세한 "), { type: "link", href: "https://a.b", content: text("설명") }],
      }),
      block("table", {
        content: {
          type: "tableContent",
          rows: [
            {
              cells: [
                { type: "tableCell", content: text("가"), props: {} },
                { type: "tableCell", content: text("나"), props: {} },
              ],
            },
          ],
        },
      }),
      block("image", {
        props: { url: "https://x/a.png", caption: "그림 설명" },
        content: undefined,
      }),
      block("divider", { content: undefined }),
    ];
    expect(extractPlainText(doc)).toBe(
      "인공지능이란\n항목 1\n하위 항목\n자세한 설명\n가 | 나\n그림 설명",
    );
  });

  it("교사 전용 박스와 그 안의 내용은 빼고 뽑는다(결정 1)", () => {
    const doc = [
      block("paragraph", { content: text("학생용") }),
      block("teacherBox", {
        content: text("정답: 42"),
        children: [block("paragraph", { content: text("평가 기준") })],
      }),
    ];
    expect(extractPlainText(doc)).toBe("학생용");
    expect(stripTeacherOnlyBlocks(doc).map((b) => b.type)).toEqual(["paragraph"]);
  });

  it("하위 블록 속 교사 전용 박스도 뺀다", () => {
    const doc = [
      block("toggleListItem", {
        content: text("펼치기"),
        children: [block("teacherBox", { content: text("비밀") })],
      }),
    ];
    expect(extractPlainText(doc)).toBe("펼치기");
    expect(stripTeacherOnlyBlocks(doc)[0].children).toEqual([]);
  });
});

describe("parseYouTubeId", () => {
  it.each([
    ["https://www.youtube.com/watch?v=dQw4w9WgXcQ", "dQw4w9WgXcQ"],
    ["https://youtu.be/dQw4w9WgXcQ?t=10", "dQw4w9WgXcQ"],
    ["https://m.youtube.com/watch?v=dQw4w9WgXcQ&list=x", "dQw4w9WgXcQ"],
    ["https://www.youtube.com/shorts/dQw4w9WgXcQ", "dQw4w9WgXcQ"],
    ["https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ", "dQw4w9WgXcQ"],
    ["dQw4w9WgXcQ", "dQw4w9WgXcQ"],
  ])("%s → 영상 ID", (input, id) => {
    expect(parseYouTubeId(input)).toBe(id);
  });

  it.each([
    "https://evil.com/watch?v=dQw4w9WgXcQ",
    "https://www.youtube.com/watch?v=short",
    "javascript:alert(1)",
    'dQw4w9WgXcQ"><script>',
    "",
  ])("영상 주소가 아니면 null: %s", (input) => {
    expect(parseYouTubeId(input)).toBeNull();
  });
});

describe("업로드 규칙", () => {
  it("이미지 10MB·파일 50MB 제한", () => {
    expect(uploadError("image/png", MAX_IMAGE_BYTES)).toBeNull();
    expect(uploadError("image/png", MAX_IMAGE_BYTES + 1)).toContain("10MB");
    expect(uploadError("application/pdf", 30 * 1024 * 1024)).toBeNull();
    expect(uploadError("application/pdf", 50 * 1024 * 1024 + 1)).toContain("50MB");
    expect(uploadError("application/pdf", 0)).toContain("빈 파일");
  });

  it("SVG·HTML·실행 파일은 받지 않는다", () => {
    for (const mime of [
      "image/svg+xml",
      "text/html",
      "application/x-msdownload",
      "application/javascript",
    ]) {
      expect(uploadError(mime, 100), mime).not.toBeNull();
    }
  });

  it("형식을 모르는 파일은 확장자로 정한다", () => {
    expect(resolveMimeType("수업.hwp", "")).toBe("application/x-hwp");
    expect(resolveMimeType("main.py", "application/octet-stream")).toBe("text/x-python");
    expect(resolveMimeType("a.png", "image/png")).toBe("image/png");
    expect(resolveMimeType("unknown.xyz", "")).toBe("application/octet-stream");
  });

  it("Storage 경로용 이름은 영문·숫자만 남긴다", () => {
    expect(storageSafeName("1차시 활동지.hwp")).toBe("1.hwp");
    expect(storageSafeName("../../etc/passwd")).toBe("etc-passwd");
    expect(storageSafeName("Lesson Plan (final).PDF")).toBe("Lesson-Plan-final.pdf");
    expect(storageSafeName("한글만.png")).toBe("file.png");
  });
});
