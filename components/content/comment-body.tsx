import { type CommentInline, parseComment } from "@/lib/board/comment-format";

/** 댓글 인라인: 링크는 http(s)만(파서가 보장), 새 탭·noopener. HTML을 넣지 않는다. */
function Inline({ nodes }: { nodes: CommentInline[] }) {
  return (
    <>
      {nodes.map((node, i) => {
        switch (node.type) {
          case "text":
            return <span key={i}>{node.text}</span>;
          case "link":
            return (
              <a
                key={i}
                href={node.href}
                target="_blank"
                rel="noopener noreferrer nofollow ugc"
                className="font-medium break-all text-brand underline underline-offset-2"
              >
                {node.href}
              </a>
            );
          case "code":
            return (
              <code key={i} className="rounded bg-muted px-1 py-0.5 font-mono text-[0.9em]">
                {node.text}
              </code>
            );
          case "bold":
            return (
              <strong key={i} className="font-semibold">
                <Inline nodes={node.children} />
              </strong>
            );
        }
      })}
    </>
  );
}

/** 댓글 본문(P5 결정: 자동 링크·굵게·인라인 코드·코드 블록). 줄바꿈은 그대로 보인다. */
export function CommentBody({ body }: { body: string }) {
  return (
    <div className="flex flex-col gap-2 text-sm leading-relaxed break-keep">
      {parseComment(body).map((block, i) =>
        block.type === "code" ? (
          <pre
            key={i}
            className="overflow-x-auto rounded-lg bg-muted px-3 py-2 font-mono text-[13px] leading-snug"
          >
            <code>{block.code}</code>
          </pre>
        ) : (
          <p key={i} className="break-words whitespace-pre-wrap">
            <Inline nodes={block.inline} />
          </p>
        ),
      )}
    </div>
  );
}
