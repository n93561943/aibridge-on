"use client";

import { createReactBlockSpec } from "@blocknote/react";
import { InfoIcon, LightbulbIcon, TriangleAlertIcon } from "lucide-react";

import { cn } from "@/lib/utils";

export const CALLOUT_TONES = {
  info: { label: "안내", icon: InfoIcon, className: "border-sky-300 bg-sky-50 dark:bg-sky-950/40" },
  tip: {
    label: "팁",
    icon: LightbulbIcon,
    className: "border-emerald-300 bg-emerald-50 dark:bg-emerald-950/40",
  },
  warning: {
    label: "주의",
    icon: TriangleAlertIcon,
    className: "border-amber-300 bg-amber-50 dark:bg-amber-950/40",
  },
} as const;

type Tone = keyof typeof CALLOUT_TONES;

/** 콜아웃: 아이콘 + 강조 문단. 종류(안내·팁·주의)는 왼쪽 아이콘을 눌러 바꾼다. */
export const calloutBlock = createReactBlockSpec(
  {
    type: "callout",
    propSchema: {
      tone: { default: "info", values: ["info", "tip", "warning"] },
    },
    content: "inline",
  },
  {
    render: ({ block, editor, contentRef }) => {
      const tone =
        (block.props.tone as Tone) in CALLOUT_TONES ? (block.props.tone as Tone) : "info";
      const { icon: Icon, label, className } = CALLOUT_TONES[tone];
      const order: Tone[] = ["info", "tip", "warning"];
      const next = order[(order.indexOf(tone) + 1) % order.length];
      return (
        <div className={cn("flex w-full gap-2 rounded-lg border-l-4 px-3 py-2", className)}>
          <button
            type="button"
            contentEditable={false}
            className="mt-0.5 shrink-0 rounded p-0.5 hover:bg-black/5"
            aria-label={`콜아웃 종류: ${label} (눌러서 ${CALLOUT_TONES[next].label}(으)로 바꾸기)`}
            onClick={() => editor.updateBlock(block, { props: { tone: next } })}
          >
            <Icon className="size-4" aria-hidden />
          </button>
          <div ref={contentRef} className="min-w-0 flex-1" />
        </div>
      );
    },
  },
);
