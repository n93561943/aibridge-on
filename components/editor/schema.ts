import { BlockNoteSchema, createCodeBlockSpec, defaultBlockSpecs } from "@blocknote/core";
import { codeBlockOptions } from "@blocknote/code-block";

import { calloutBlock } from "./blocks/callout";
import { judgeLinkBlock } from "./blocks/judge-link";
import { teacherBoxBlock } from "./blocks/teacher-box";
import { youtubeBlock } from "./blocks/youtube";

// 오디오·동영상 업로드 블록은 쓰지 않는다(동영상은 YouTube 블록으로).
const baseBlocks = Object.fromEntries(
  Object.entries(defaultBlockSpecs).filter(([type]) => type !== "audio" && type !== "video"),
) as Omit<typeof defaultBlockSpecs, "audio" | "video">;

/** 게시물 에디터 스키마. 블록 종류는 lib/posts/content.ts의 ALLOWED_BLOCK_TYPES와 같게 유지한다. */
export const postSchema = BlockNoteSchema.create({
  blockSpecs: {
    ...baseBlocks,
    codeBlock: createCodeBlockSpec({ ...codeBlockOptions, defaultLanguage: "python" }),
    callout: calloutBlock(),
    youtube: youtubeBlock(),
    teacherBox: teacherBoxBlock(),
    judgeLink: judgeLinkBlock(),
  },
});

export type PostEditorType = typeof postSchema.BlockNoteEditor;
export type PostPartialBlock = typeof postSchema.PartialBlock;
