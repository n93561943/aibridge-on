"use client";

import { CheckIcon, CopyIcon } from "lucide-react";
import { useState } from "react";

/** 코드 블록 복사 버튼(F-07) */
export function CopyButton({ text, label = "코드 복사" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } catch {
          setCopied(false);
        }
      }}
      className="inline-flex h-8 items-center gap-1 rounded-md border bg-background px-2 text-xs font-medium text-muted-foreground hover:text-foreground print:hidden"
      aria-label={copied ? "복사했습니다" : label}
    >
      {copied ? (
        <CheckIcon className="size-3.5" aria-hidden />
      ) : (
        <CopyIcon className="size-3.5" aria-hidden />
      )}
      <span aria-live="polite">{copied ? "복사됨" : "복사"}</span>
    </button>
  );
}
