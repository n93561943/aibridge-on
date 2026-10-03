"use client";

import { createReactBlockSpec } from "@blocknote/react";
import { CodeXmlIcon, ExternalLinkIcon } from "lucide-react";

import { buildJudgeUrl, JUDGE_PROBLEM_ID } from "@/lib/settings/online-judge";

import { useEditorSettings } from "../editor-context";

/**
 * 온라인 저지 문제 링크: 문제 번호만 저장하고, 주소는 site_settings의 형식으로 만든다.
 * 형식이 설정되지 않았으면 "준비 중" 비활성 버튼으로 보인다(결정 3).
 */
export const judgeLinkBlock = createReactBlockSpec(
  {
    type: "judgeLink",
    propSchema: {
      problemId: { default: "" },
      label: { default: "" },
    },
    content: "none",
  },
  {
    render: function JudgeLink({ block, editor }) {
      const { judgeUrlTemplate } = useEditorSettings();
      const { problemId, label } = block.props;
      const url = buildJudgeUrl(judgeUrlTemplate, problemId);
      const text = label || (problemId ? `${problemId}번 문제 풀기` : "문제 풀기");

      return (
        <div contentEditable={false} className="flex w-full flex-col gap-2 rounded-lg border p-3">
          {editor.isEditable && (
            <div className="flex flex-wrap gap-2 text-sm">
              <label className="flex items-center gap-1">
                문제 번호
                <input
                  className="h-8 w-28 rounded-md border px-2"
                  defaultValue={problemId}
                  maxLength={20}
                  placeholder="예: 1001"
                  onBlur={(e) => {
                    const value = e.target.value.trim();
                    if (value === problemId) return;
                    if (value && !JUDGE_PROBLEM_ID.test(value)) {
                      e.target.value = problemId;
                      window.alert("문제 번호는 영문·숫자·하이픈만 쓸 수 있습니다(20자 이하).");
                      return;
                    }
                    editor.updateBlock(block, { props: { problemId: value } });
                  }}
                />
              </label>
              <label className="flex min-w-0 flex-1 basis-56 items-center gap-1">
                버튼 글자
                <input
                  className="h-8 min-w-0 flex-1 rounded-md border px-2"
                  defaultValue={label}
                  maxLength={50}
                  placeholder="비우면 'N번 문제 풀기'"
                  onBlur={(e) => {
                    if (e.target.value !== label)
                      editor.updateBlock(block, { props: { label: e.target.value } });
                  }}
                />
              </label>
            </div>
          )}
          {url ? (
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex w-fit items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
            >
              <CodeXmlIcon className="size-4" aria-hidden />
              {text}
              <ExternalLinkIcon className="size-3.5" aria-label="새 탭" />
            </a>
          ) : (
            <span
              aria-disabled="true"
              className="inline-flex w-fit cursor-not-allowed items-center gap-2 rounded-lg bg-muted px-4 py-2 text-sm font-medium text-muted-foreground"
            >
              <CodeXmlIcon className="size-4" aria-hidden />
              {text} (준비 중)
            </span>
          )}
          {editor.isEditable && !judgeUrlTemplate && (
            <p className="text-xs text-muted-foreground">
              온라인 저지 주소가 아직 설정되지 않아 버튼이 비활성으로 보입니다. 주소를 설정하면 바로
              활성화됩니다.
            </p>
          )}
        </div>
      );
    },
  },
);
