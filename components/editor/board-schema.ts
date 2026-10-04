import {
  BlockNoteSchema,
  createCodeBlockSpec,
  defaultBlockSpecs,
  defaultStyleSpecs,
} from "@blocknote/core";
import { codeBlockOptions } from "@blocknote/code-block";

/**
 * 게시판 글쓰기용 간소화 스키마(F-08): 문단·목록·코드 블록·이미지, 서식은 굵게·인라인 코드(+ 링크).
 * lib/board/content.ts의 BOARD_BLOCK_TYPES와 같게 유지한다. 붙여넣은 다른 서식은 스키마가 버린다.
 */
export const boardSchema = BlockNoteSchema.create({
  blockSpecs: {
    paragraph: defaultBlockSpecs.paragraph,
    bulletListItem: defaultBlockSpecs.bulletListItem,
    numberedListItem: defaultBlockSpecs.numberedListItem,
    codeBlock: createCodeBlockSpec({ ...codeBlockOptions, defaultLanguage: "python" }),
    image: defaultBlockSpecs.image,
  },
  styleSpecs: {
    bold: defaultStyleSpecs.bold,
    code: defaultStyleSpecs.code,
  },
});

export type BoardEditorType = typeof boardSchema.BlockNoteEditor;
export type BoardPartialBlock = typeof boardSchema.PartialBlock;
