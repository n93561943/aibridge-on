import { cn } from "@/lib/utils";

import { colorStyle } from "./colors";

type Styles = {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
  code?: boolean;
  textColor?: string;
  backgroundColor?: string;
};
type InlineNode =
  | { type: "text"; text: string; styles?: Styles }
  | { type: "link"; href: string; content: InlineNode[] };

const SAFE_HREF = /^(https?:\/\/|mailto:)/i;

function Text({ node }: { node: { text: string; styles?: Styles } }) {
  const s = node.styles ?? {};
  let el: React.ReactNode = node.text;
  if (s.code)
    el = <code className="rounded bg-muted px-1 py-0.5 font-mono text-[0.9em]">{el}</code>;
  const className = cn(
    s.bold && "font-semibold",
    s.italic && "italic",
    s.underline && "underline",
    s.strike && "line-through",
  );
  const style = colorStyle(s.textColor, s.backgroundColor);
  return className || style ? (
    <span className={className || undefined} style={style}>
      {el}
    </span>
  ) : (
    <>{el}</>
  );
}

/** BlockNote 인라인 콘텐츠(텍스트·링크) 렌더링. 링크는 http(s)·mailto만 살린다. */
export function Inline({ content }: { content: unknown }) {
  if (typeof content === "string") return <>{content}</>;
  if (!Array.isArray(content)) return null;
  return (
    <>
      {(content as InlineNode[]).map((node, i) => {
        if (!node || typeof node !== "object") return null;
        if (node.type === "link") {
          const inner = <Inline content={node.content} />;
          if (typeof node.href !== "string" || !SAFE_HREF.test(node.href))
            return <span key={i}>{inner}</span>;
          return (
            <a
              key={i}
              href={node.href}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-brand underline underline-offset-2"
            >
              {inner}
            </a>
          );
        }
        if (node.type === "text" && typeof node.text === "string")
          return <Text key={i} node={node} />;
        return null;
      })}
    </>
  );
}

/** 인라인 콘텐츠의 글자만(코드 복사·대체 텍스트용) */
export function inlinePlainText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return (content as InlineNode[])
    .map((n) =>
      n?.type === "text" ? n.text : n?.type === "link" ? inlinePlainText(n.content) : "",
    )
    .join("");
}
