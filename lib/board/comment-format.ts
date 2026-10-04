/**
 * 댓글 서식(P5 결정): 주소 자동 링크, **굵게**, `인라인 코드`, ``` 코드 블록 ```만.
 * 문자열을 토큰으로 나누기만 하고, 화면은 이 토큰을 React 요소로 그린다(HTML 금지).
 */

export type CommentInline =
  | { type: "text"; text: string }
  | { type: "link"; href: string }
  | { type: "code"; text: string }
  | { type: "bold"; children: CommentInline[] };

export type CommentBlock =
  { type: "text"; inline: CommentInline[] } | { type: "code"; code: string };

/** ```(언어)\n 코드 ``` — 언어 표시는 버린다 */
const FENCE = /```[^\n`]*\n?([\s\S]*?)```/g;
const INLINE = /`([^`\n]+)`|\*\*(?=\S)([^\n]*?\S)\*\*/g;
const URL = /https?:\/\/[^\s<>"'`]+/g;
/** 주소 끝에 붙은 문장 부호는 링크에서 뺀다 */
const TRAILING = /[.,!?;:'")\]}]+$/;

function linkify(text: string): CommentInline[] {
  const out: CommentInline[] = [];
  let last = 0;
  for (const match of text.matchAll(URL)) {
    const start = match.index;
    const href = match[0].replace(TRAILING, "");
    if (start > last) out.push({ type: "text", text: text.slice(last, start) });
    out.push({ type: "link", href });
    last = start + href.length;
  }
  if (last < text.length) out.push({ type: "text", text: text.slice(last) });
  return out;
}

export function parseCommentInline(text: string): CommentInline[] {
  const out: CommentInline[] = [];
  let last = 0;
  for (const match of text.matchAll(INLINE)) {
    if (match.index > last) out.push(...linkify(text.slice(last, match.index)));
    if (match[1] !== undefined) out.push({ type: "code", text: match[1] });
    else out.push({ type: "bold", children: linkify(match[2]) });
    last = match.index + match[0].length;
  }
  if (last < text.length) out.push(...linkify(text.slice(last)));
  return out;
}

/** 줄바꿈은 그대로 둔다(화면에서 whitespace-pre-wrap). 코드 블록 앞뒤 빈 줄은 하나로 줄인다. */
export function parseComment(body: string): CommentBlock[] {
  const blocks: CommentBlock[] = [];
  const pushText = (text: string) => {
    const trimmed = text.replace(/^\n+|\n+$/g, "");
    if (trimmed.trim()) blocks.push({ type: "text", inline: parseCommentInline(trimmed) });
  };
  let last = 0;
  for (const match of body.matchAll(FENCE)) {
    pushText(body.slice(last, match.index));
    const code = match[1].replace(/\n$/, "");
    if (code) blocks.push({ type: "code", code });
    last = match.index + match[0].length;
  }
  pushText(body.slice(last));
  return blocks;
}
