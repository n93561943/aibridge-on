import { z } from "zod";

/**
 * 게시물 본문(BlockNote 블록 JSON) 공통 규칙. 에디터·서버·공개 화면(P4)이 함께 쓴다.
 * 본문은 JSON으로만 저장하고 HTML로 저장·렌더링하지 않는다.
 */

/** 교사 이상만 보이는 블록. 공개 본문·검색 평문·AI 맥락에서 뺀다(결정 1). */
export const TEACHER_ONLY_BLOCK_TYPES = ["teacherBox"] as const;

export const ALLOWED_BLOCK_TYPES = [
  "paragraph",
  "heading",
  "quote",
  "bulletListItem",
  "numberedListItem",
  "checkListItem",
  "toggleListItem",
  "codeBlock",
  "table",
  "image",
  "file",
  "divider",
  "callout",
  "youtube",
  ...TEACHER_ONLY_BLOCK_TYPES,
] as const;

/** 본문 JSON 최대 크기(문자 수). 이미지는 URL만 들어가므로 충분하다. */
export const MAX_CONTENT_CHARS = 1_000_000;
const MAX_DEPTH = 8;

export type Block = {
  id: string;
  type: string;
  props: Record<string, unknown>;
  content?: unknown;
  children: Block[];
};

const blockSchema: z.ZodType<Block> = z.lazy(() =>
  z.object({
    id: z.string().min(1).max(100),
    type: z.enum(ALLOWED_BLOCK_TYPES, { error: "허용되지 않는 블록이 있습니다." }),
    props: z.record(z.string(), z.union([z.string().max(5000), z.number(), z.boolean(), z.null()])),
    content: z.unknown().optional(),
    children: z.array(blockSchema),
  }),
);

const SAFE_URL = /^(https?:\/\/|mailto:)/i;

/** 링크·이미지·파일 주소는 http(s)·mailto만 허용한다(javascript: 등 차단). */
function findUnsafeUrl(value: unknown, depth = 0): string | null {
  if (depth > MAX_DEPTH * 4) return "본문 구조가 너무 깊습니다.";
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findUnsafeUrl(item, depth + 1);
      if (found) return found;
    }
    return null;
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (record.type === "link" && typeof record.href === "string" && !SAFE_URL.test(record.href)) {
      return "링크 주소는 http(s)로 시작해야 합니다.";
    }
    for (const [key, v] of Object.entries(record)) {
      if (key === "url" && typeof v === "string" && v !== "" && !/^https?:\/\//i.test(v)) {
        return "파일·이미지 주소가 올바르지 않습니다.";
      }
      const found = findUnsafeUrl(v, depth + 1);
      if (found) return found;
    }
  }
  return null;
}

function maxDepth(blocks: Block[], depth = 1): number {
  return blocks.reduce(
    (m, b) => Math.max(m, b.children.length ? maxDepth(b.children, depth + 1) : depth),
    depth,
  );
}

export const postContentSchema = z.array(blockSchema).superRefine((blocks, ctx) => {
  if (JSON.stringify(blocks).length > MAX_CONTENT_CHARS) {
    ctx.addIssue({ code: "custom", message: "본문이 너무 깁니다. 여러 차시로 나눠 주세요." });
    return;
  }
  if (blocks.length && maxDepth(blocks) > MAX_DEPTH) {
    ctx.addIssue({ code: "custom", message: "들여쓰기가 너무 깊습니다." });
    return;
  }
  const unsafe = findUnsafeUrl(blocks);
  if (unsafe) ctx.addIssue({ code: "custom", message: unsafe });
});

export const postTitleSchema = z
  .string({ error: "제목을 입력해 주세요." })
  .trim()
  .min(1, "제목을 입력해 주세요.")
  .max(200, "제목은 200자 이하여야 합니다.");

/** 인라인 콘텐츠(텍스트·링크) 배열에서 글자만 */
function inlineText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((item) => {
      if (!item || typeof item !== "object") return "";
      const node = item as { type?: string; text?: unknown; content?: unknown };
      if (typeof node.text === "string") return node.text;
      if (node.type === "link") return inlineText(node.content);
      return "";
    })
    .join("");
}

/** 표 블록: { type: "tableContent", rows: [{ cells: [inline[] | { content }] }] } */
function tableText(content: unknown): string[] {
  const rows = (content as { rows?: { cells?: unknown[] }[] } | undefined)?.rows;
  if (!Array.isArray(rows)) return [];
  return rows.map((row) =>
    (row.cells ?? [])
      .map((cell) =>
        inlineText(
          cell && typeof cell === "object" && !Array.isArray(cell)
            ? (cell as { content?: unknown }).content
            : cell,
        ),
      )
      .join(" | "),
  );
}

export function isTeacherOnlyBlock(block: Pick<Block, "type">): boolean {
  return (TEACHER_ONLY_BLOCK_TYPES as readonly string[]).includes(block.type);
}

/**
 * 검색·미리보기·AI 맥락용 평문. 교사 전용 블록(과 그 하위 블록)은 뺀다.
 * 이미지·파일은 캡션만, YouTube는 캡션만 넣는다.
 */
export function extractPlainText(blocks: Block[]): string {
  const lines: string[] = [];
  const walk = (list: Block[]) => {
    for (const block of list) {
      if (isTeacherOnlyBlock(block)) continue;
      if (block.type === "table") lines.push(...tableText(block.content));
      else if (typeof block.props.caption === "string" && block.props.caption) {
        lines.push(block.props.caption);
      } else {
        const text = inlineText(block.content);
        if (text) lines.push(text);
      }
      walk(block.children);
    }
  };
  walk(blocks);
  return lines
    .map((l) => l.trim())
    .filter(Boolean)
    .join("\n");
}

/** 교사 전용 블록을 뺀 본문(공개 화면·비교사용). 원본은 바꾸지 않는다. */
export function stripTeacherOnlyBlocks(blocks: Block[]): Block[] {
  return blocks
    .filter((b) => !isTeacherOnlyBlock(b))
    .map((b) => ({ ...b, children: stripTeacherOnlyBlocks(b.children) }));
}

const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;

/** YouTube 주소(또는 영상 ID)에서 11자리 영상 ID만 뽑는다. 아니면 null. */
export function parseYouTubeId(input: string): string | null {
  const value = input.trim();
  if (YOUTUBE_ID.test(value)) return value;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^(www\.|m\.)/, "");
  let id: string | null = null;
  if (host === "youtu.be") id = url.pathname.slice(1).split("/")[0];
  else if (host === "youtube.com" || host === "youtube-nocookie.com") {
    if (url.pathname === "/watch") id = url.searchParams.get("v");
    else {
      const match = url.pathname.match(/^\/(embed|shorts|live)\/([^/]+)/);
      id = match?.[2] ?? null;
    }
  }
  return id && YOUTUBE_ID.test(id) ? id : null;
}
