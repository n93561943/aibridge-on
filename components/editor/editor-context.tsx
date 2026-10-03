"use client";

import { createContext, useContext } from "react";

/** 에디터 커스텀 블록이 쓰는 사이트 설정(온라인 저지 주소 형식 등) */
export const EditorSettingsContext = createContext<{ judgeUrlTemplate: string | null }>({
  judgeUrlTemplate: null,
});

export function useEditorSettings() {
  return useContext(EditorSettingsContext);
}
