"use client";

import { createReactBlockSpec } from "@blocknote/react";
import { LockIcon } from "lucide-react";

/**
 * 교사 전용 박스: 교사 이상에게만 보인다. 박스 제목(한 줄) 아래에 Tab으로 들여 쓴 블록이 박스 안 내용이 된다.
 * 공개 본문·검색 평문·AI 맥락에서는 서버가 이 블록과 하위 블록을 통째로 뺀다(결정 1).
 */
export const teacherBoxBlock = createReactBlockSpec(
  {
    type: "teacherBox",
    propSchema: {},
    content: "inline",
  },
  {
    render: ({ contentRef }) => (
      <div className="flex w-full flex-col gap-1">
        <span
          contentEditable={false}
          className="inline-flex items-center gap-1 text-xs font-semibold text-violet-800 dark:text-violet-300"
        >
          <LockIcon className="size-3.5" aria-hidden />
          교사 전용 · 학생과 비회원에게는 보이지 않습니다 (Tab으로 들여 쓴 내용이 박스 안에
          들어갑니다)
        </span>
        <div ref={contentRef} className="min-w-0 font-medium" />
      </div>
    ),
  },
);
