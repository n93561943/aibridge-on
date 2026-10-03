"use client";

import "@blocknote/mantine/style.css";
import "./editor.css";

import { ko } from "@blocknote/core/locales";
import { filterSuggestionItems, insertOrUpdateBlockForSlashMenu } from "@blocknote/core/extensions";
import { BlockNoteView } from "@blocknote/mantine";
import {
  type DefaultReactSuggestionItem,
  getDefaultReactSlashMenuItems,
  SuggestionMenuController,
  useCreateBlockNote,
} from "@blocknote/react";
import { CodeXmlIcon, InfoIcon, LockIcon, MonitorPlayIcon } from "lucide-react";

import type { Block } from "@/lib/posts/content";

import { EditorSettingsContext } from "./editor-context";
import { postSchema, type PostEditorType, type PostPartialBlock } from "./schema";

// 쓰지 않는 기본 슬래시 메뉴 항목
const HIDDEN_SLASH_KEYS = new Set(["audio", "video", "emoji", "page_break"]);

function customSlashItems(editor: PostEditorType): DefaultReactSuggestionItem[] {
  return [
    {
      title: "콜아웃",
      subtext: "아이콘이 있는 강조 문단(안내·팁·주의)",
      aliases: ["callout", "콜아웃", "안내", "팁", "주의"],
      group: "기타",
      icon: <InfoIcon size={18} />,
      onItemClick: () => insertOrUpdateBlockForSlashMenu(editor, { type: "callout" }),
    },
    {
      title: "YouTube",
      subtext: "YouTube 영상 넣기",
      aliases: ["youtube", "유튜브", "영상", "동영상"],
      group: "미디어",
      icon: <MonitorPlayIcon size={18} />,
      onItemClick: () => insertOrUpdateBlockForSlashMenu(editor, { type: "youtube" }),
    },
    {
      title: "교사 전용 박스",
      subtext: "교사 이상에게만 보이는 내용(정답·평가 기준 등)",
      aliases: ["teacher", "교사", "정답", "비공개"],
      group: "수업",
      icon: <LockIcon size={18} />,
      onItemClick: () => insertOrUpdateBlockForSlashMenu(editor, { type: "teacherBox" }),
    },
    {
      title: "온라인 저지 문제",
      subtext: "문제 번호로 외부 문제 풀기 버튼 만들기",
      aliases: ["judge", "저지", "문제", "코딩"],
      group: "수업",
      icon: <CodeXmlIcon size={18} />,
      onItemClick: () => insertOrUpdateBlockForSlashMenu(editor, { type: "judgeLink" }),
    },
  ];
}

export type PostEditorProps = {
  initialContent: Block[];
  onChange: (content: Block[]) => void;
  uploadFile: (file: File) => Promise<string>;
  /** 온라인 저지 문제 주소 형식(site_settings). 없으면 문제 링크 버튼이 비활성. */
  judgeUrlTemplate: string | null;
};

/**
 * Notion 스타일 블록 에디터(F-05). 마크다운 단축 입력·붙여넣기 변환·블록 드래그는 BlockNote 기본 기능.
 * 브라우저 전용이므로 next/dynamic(ssr: false)으로 불러온다.
 */
export default function PostEditor({
  initialContent,
  onChange,
  uploadFile,
  judgeUrlTemplate,
}: PostEditorProps) {
  const editor = useCreateBlockNote({
    schema: postSchema,
    dictionary: {
      ...ko,
      placeholders: {
        ...ko.placeholders,
        emptyDocument: "'/'를 입력해 블록을 고르거나, 내용을 입력하세요.",
      },
    },
    // 서버에서 검증된 블록 JSON. 비어 있으면 BlockNote 기본 빈 문단으로 시작한다.
    initialContent: initialContent.length
      ? (initialContent as unknown as PostPartialBlock[])
      : undefined,
    uploadFile,
    tables: { headers: true },
  });

  return (
    <EditorSettingsContext.Provider value={{ judgeUrlTemplate }}>
      <BlockNoteView
        editor={editor}
        theme="light"
        slashMenu={false}
        onChange={() => onChange(editor.document as unknown as Block[])}
        className="post-editor min-h-[50vh]"
      >
        <SuggestionMenuController
          triggerCharacter="/"
          getItems={async (query) =>
            filterSuggestionItems(
              [
                ...getDefaultReactSlashMenuItems(editor).filter(
                  (item) => !HIDDEN_SLASH_KEYS.has((item as { key?: string }).key ?? ""),
                ),
                ...customSlashItems(editor),
              ],
              query,
            )
          }
        />
      </BlockNoteView>
    </EditorSettingsContext.Provider>
  );
}
