"use client";

import "@blocknote/mantine/style.css";
import "./editor.css";

import { ko } from "@blocknote/core/locales";
import { filterSuggestionItems } from "@blocknote/core/extensions";
import { BlockNoteView } from "@blocknote/mantine";
import {
  FilePanelController,
  type FilePanelProps,
  getDefaultReactSlashMenuItems,
  SuggestionMenuController,
  UploadTab,
  useComponentsContext,
  useCreateBlockNote,
  useDictionary,
} from "@blocknote/react";
import { useState } from "react";

import type { Block } from "@/lib/posts/content";

import { boardSchema, type BoardPartialBlock } from "./board-schema";

// 쓰지 않는 기본 슬래시 메뉴 항목(스키마에 없는 블록은 BlockNote가 알아서 뺀다)
const HIDDEN_SLASH_KEYS = new Set(["emoji"]);

/** 이미지 패널: 업로드 탭만. 외부 이미지 주소 넣기(Embed)는 막는다(서버도 거부). */
function UploadOnlyFilePanel({ blockId }: FilePanelProps) {
  const Components = useComponentsContext()!;
  const dict = useDictionary();
  const [loading, setLoading] = useState(false);
  const name = dict.file_panel.upload.title;
  return (
    <Components.FilePanel.Root
      className="bn-panel"
      defaultOpenTab={name}
      openTab={name}
      setOpenTab={() => {}}
      tabs={[{ name, tabPanel: <UploadTab blockId={blockId} setLoading={setLoading} /> }]}
      loading={loading}
    />
  );
}

export type BoardEditorProps = {
  initialContent: Block[];
  onChange: (content: Block[]) => void;
  uploadFile: (file: File) => Promise<string>;
};

/**
 * 게시판 글쓰기 에디터(F-08 간소화): 문단·굵게·인라인 코드·링크·목록·코드 블록·이미지.
 * 브라우저 전용이므로 next/dynamic(ssr: false)으로 불러온다.
 */
export default function BoardEditor({ initialContent, onChange, uploadFile }: BoardEditorProps) {
  const editor = useCreateBlockNote({
    schema: boardSchema,
    dictionary: {
      ...ko,
      placeholders: {
        ...ko.placeholders,
        emptyDocument: "내용을 입력하세요. '/'로 목록·코드·이미지를 넣을 수 있습니다.",
      },
    },
    initialContent: initialContent.length
      ? (initialContent as unknown as BoardPartialBlock[])
      : undefined,
    uploadFile,
  });

  return (
    <BlockNoteView
      editor={editor}
      theme="light"
      slashMenu={false}
      filePanel={false}
      onChange={() => onChange(editor.document as unknown as Block[])}
      className="post-editor board-editor min-h-60"
    >
      <SuggestionMenuController
        triggerCharacter="/"
        getItems={async (query) =>
          filterSuggestionItems(
            getDefaultReactSlashMenuItems(editor).filter(
              (item) => !HIDDEN_SLASH_KEYS.has((item as { key?: string }).key ?? ""),
            ),
            query,
          )
        }
      />
      <FilePanelController filePanel={UploadOnlyFilePanel} />
    </BlockNoteView>
  );
}
