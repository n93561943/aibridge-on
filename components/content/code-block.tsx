import { bundledLanguages, codeToTokens } from "shiki";

import { CopyButton } from "./copy-button";

const LANGUAGE_LABELS: Record<string, string> = {
  python: "Python",
  javascript: "JavaScript",
  typescript: "TypeScript",
  html: "HTML",
  css: "CSS",
  c: "C",
  cpp: "C++",
  java: "Java",
  json: "JSON",
  sql: "SQL",
  bash: "Bash",
  text: "텍스트",
};

/** 서버에서 구문 강조한 코드 블록 + 복사 버튼. 토큰을 span으로 그린다(HTML 문자열 주입 없음). */
export async function CodeBlock({ code, language }: { code: string; language: string }) {
  const lang = language in bundledLanguages ? language : "text";
  let lines: { content: string; color?: string }[][];
  try {
    lines =
      lang === "text"
        ? code.split("\n").map((l) => [{ content: l }])
        : (await codeToTokens(code, { lang: lang as never, theme: "github-light" })).tokens;
  } catch {
    lines = code.split("\n").map((l) => [{ content: l }]);
  }

  return (
    <figure className="my-4 overflow-hidden rounded-lg border bg-[#f6f8fa] print:break-inside-avoid">
      <figcaption className="flex items-center justify-between border-b bg-background/60 px-3 py-1.5 text-xs text-muted-foreground">
        <span>{LANGUAGE_LABELS[lang] ?? lang}</span>
        <CopyButton text={code} />
      </figcaption>
      <pre className="overflow-x-auto p-3 text-sm leading-relaxed print:whitespace-pre-wrap">
        <code className="font-mono">
          {lines.map((tokens, i) => (
            <span key={i} className="block min-h-[1lh]">
              {tokens.map((t, j) => (
                <span key={j} style={t.color ? { color: t.color } : undefined}>
                  {t.content}
                </span>
              ))}
            </span>
          ))}
        </code>
      </pre>
    </figure>
  );
}
