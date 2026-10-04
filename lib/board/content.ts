import { z } from "zod";

import { type Block, extractPlainText } from "@/lib/posts/content";
import { POST_FILES_BUCKET } from "@/lib/posts/constants";

/**
 * 게시판 글 본문 규칙(F-08 간소화 에디터): 문단·목록·코드 블록·이미지, 글자 서식은 굵게·인라인 코드·링크.
 * 브라우저가 보낸 JSON을 그대로 저장하지 않고, 허용한 블록·속성·서식만 골라 새로 만든다.
 * 이미지는 사이트 버킷에 올린 파일만 쓸 수 있다(외부 이미지 금지).
 */

export const BOARD_BLOCK_TYPES = [
  "paragraph",
  "bulletListItem",
  "numberedListItem",
  "codeBlock",
  "image",
] as const;

export const BOARD_TITLE_MAX = 300;
const MAX_CONTENT_CHARS = 100_000;
const MAX_BLOCKS = 500;
/** 목록 들여쓰기 최대 단계 */
const MAX_LIST_DEPTH = 4;

export const boardTitleSchema = z
  .string({ error: "제목을 입력해 주세요." })
  .trim()
  .min(1, "제목을 입력해 주세요.")
  .max(BOARD_TITLE_MAX, `제목은 ${BOARD_TITLE_MAX}자 이하여야 합니다.`);

/** 업로드 파일 공개 주소의 앞부분: <Supabase 주소>/storage/v1/object/public/post-files/ */
export function uploadUrlPrefix(supabaseUrl: string): string {
  return `${supabaseUrl.replace(/\/+$/, "")}/storage/v1/object/public/${POST_FILES_BUCKET}/`;
}

/** 공개 주소 → 버킷 안 경로. 사이트 버킷 주소가 아니면 null. */
export function storagePathFromUrl(url: string, prefix: string): string | null {
  if (!url.startsWith(prefix)) return null;
  let path: string;
  try {
    path = decodeURIComponent(url.slice(prefix.length));
  } catch {
    return null;
  }
  if (!path || path.includes("..") || path.includes("?") || path.includes("#")) return null;
  return path;
}

type Inline =
  | { type: "text"; text: string; styles: { bold?: true; code?: true } }
  | { type: "link"; href: string; content: Inline[] };

const SAFE_HREF = /^(https?:\/\/|mailto:)/i;

class ContentError extends Error {}

function cleanText(item: Record<string, unknown>, allowStyles: boolean): Inline {
  if (typeof item.text !== "string") throw new ContentError("본문 형식이 올바르지 않습니다.");
  const raw = (item.styles ?? {}) as Record<string, unknown>;
  const styles: { bold?: true; code?: true } = {};
  if (allowStyles && raw.bold === true) styles.bold = true;
  if (allowStyles && raw.code === true) styles.code = true;
  return { type: "text", text: item.text, styles };
}

/** 인라인 내용: 글자(굵게·코드만)와 링크(http(s)·mailto). 그 밖의 서식·요소는 버린다. */
function cleanInline(content: unknown, allowStyles: boolean, allowLinks: boolean): Inline[] {
  if (content === undefined) return [];
  if (!Array.isArray(content)) throw new ContentError("본문 형식이 올바르지 않습니다.");
  const out: Inline[] = [];
  for (const raw of content) {
    if (!raw || typeof raw !== "object") throw new ContentError("본문 형식이 올바르지 않습니다.");
    const item = raw as Record<string, unknown>;
    if (item.type === "text") out.push(cleanText(item, allowStyles));
    else if (item.type === "link") {
      const children = cleanInline(item.content, allowStyles, false);
      if (!allowLinks) out.push(...children);
      else {
        if (
          typeof item.href !== "string" ||
          !SAFE_HREF.test(item.href) ||
          item.href.length > 2000
        ) {
          throw new ContentError("링크 주소는 http(s)로 시작해야 합니다.");
        }
        out.push({ type: "link", href: item.href, content: children });
      }
    } else throw new ContentError("본문 형식이 올바르지 않습니다.");
  }
  return out;
}

const TEXT_PROPS = { textColor: "default", backgroundColor: "default", textAlignment: "left" };
const LANGUAGE = /^[a-z0-9+#-]{1,20}$/;

type CleanState = { count: number; imagePaths: string[]; prefix: string };

function cleanBlock(raw: unknown, depth: number, state: CleanState): Block {
  if (++state.count > MAX_BLOCKS) throw new ContentError("본문이 너무 깁니다.");
  if (!raw || typeof raw !== "object") throw new ContentError("본문 형식이 올바르지 않습니다.");
  const block = raw as Record<string, unknown>;
  const type = block.type as string;
  if (!(BOARD_BLOCK_TYPES as readonly string[]).includes(type)) {
    throw new ContentError("게시판에서 쓸 수 없는 블록이 있습니다.");
  }
  const id =
    typeof block.id === "string" && /^[A-Za-z0-9_-]{1,100}$/.test(block.id)
      ? block.id
      : crypto.randomUUID();
  const props = (block.props ?? {}) as Record<string, unknown>;
  const rawChildren = Array.isArray(block.children) ? block.children : [];

  const isList = type === "bulletListItem" || type === "numberedListItem";
  if (rawChildren.length && (!isList || depth >= MAX_LIST_DEPTH)) {
    throw new ContentError("들여쓰기가 너무 깊습니다.");
  }
  const children = rawChildren.map((c) => cleanBlock(c, depth + 1, state));

  switch (type) {
    case "paragraph":
    case "bulletListItem":
      return {
        id,
        type,
        props: { ...TEXT_PROPS },
        content: cleanInline(block.content, true, true),
        children,
      };
    case "numberedListItem": {
      const start = props.start;
      return {
        id,
        type,
        props: {
          ...TEXT_PROPS,
          ...(Number.isInteger(start) && (start as number) >= 1 && (start as number) <= 9999
            ? { start: start as number }
            : {}),
        },
        content: cleanInline(block.content, true, true),
        children,
      };
    }
    case "codeBlock": {
      const language =
        typeof props.language === "string" && LANGUAGE.test(props.language)
          ? props.language
          : "text";
      return {
        id,
        type,
        props: { language },
        content: cleanInline(block.content, false, false),
        children,
      };
    }
    default: {
      // image: 사이트 버킷 주소만, 캡션·이름은 짧게
      const url = typeof props.url === "string" ? props.url : "";
      if (!url) {
        throw new ContentError(
          "이미지를 올리지 않은 이미지 블록이 있습니다. 지우거나 이미지를 올려 주세요.",
        );
      }
      const path = storagePathFromUrl(url, state.prefix);
      if (!path)
        throw new ContentError("외부 이미지 주소는 쓸 수 없습니다. 이미지를 직접 올려 주세요.");
      state.imagePaths.push(path);
      const width = props.previewWidth;
      return {
        id,
        type,
        props: {
          url,
          caption: typeof props.caption === "string" ? props.caption.slice(0, 200) : "",
          name: typeof props.name === "string" ? props.name.slice(0, 255) : "",
          showPreview: true,
          textAlignment: "left",
          backgroundColor: "default",
          ...(typeof width === "number" && width >= 50 && width <= 2000
            ? { previewWidth: Math.round(width) }
            : {}),
        },
        children,
      };
    }
  }
}

/** 내용이 없는 빈 문단은 앞뒤에서 지운다(에디터는 늘 빈 문단을 하나 남긴다). */
function trimEmptyParagraphs(blocks: Block[]): Block[] {
  const isEmpty = (b: Block) =>
    b.type === "paragraph" && !b.children.length && !(b.content as Inline[]).length;
  let start = 0;
  let end = blocks.length;
  while (start < end && isEmpty(blocks[start])) start++;
  while (end > start && isEmpty(blocks[end - 1])) end--;
  return blocks.slice(start, end);
}

export type BoardContentResult =
  | { ok: true; content: Block[]; contentText: string; imagePaths: string[] }
  | { ok: false; message: string };

/**
 * 게시판 본문 검사·정리. 본문은 비어도 된다(제목만 필수). prefix는 uploadUrlPrefix(Supabase 주소).
 * imagePaths(본문에 쓰인 업로드 경로)는 호출하는 쪽이 "본인이 올린 파일인지" 다시 확인한다.
 */
export function cleanBoardContent(raw: unknown, prefix: string): BoardContentResult {
  if (!Array.isArray(raw)) return { ok: false, message: "본문 형식이 올바르지 않습니다." };
  try {
    if (JSON.stringify(raw).length > MAX_CONTENT_CHARS) {
      return { ok: false, message: "본문이 너무 깁니다." };
    }
  } catch {
    return { ok: false, message: "본문 형식이 올바르지 않습니다." };
  }
  const state: CleanState = { count: 0, imagePaths: [], prefix };
  try {
    const content = trimEmptyParagraphs(raw.map((b) => cleanBlock(b, 0, state)));
    return {
      ok: true,
      content,
      contentText: extractPlainText(content),
      imagePaths: [...new Set(state.imagePaths)],
    };
  } catch (error) {
    if (error instanceof ContentError) return { ok: false, message: error.message };
    throw error;
  }
}
