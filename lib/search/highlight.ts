export type HighlightPart = { text: string; match: boolean };

/**
 * 검색어와 일치하는 부분을 나눈다(대소문자 무시). 화면에서는 match 부분만 <mark>로 그린다.
 * 정규식 특수 문자가 든 검색어도 글자 그대로 찾는다.
 */
export function highlightParts(text: string, query: string): HighlightPart[] {
  const q = query.trim();
  if (!q || !text) return text ? [{ text, match: false }] : [];
  const lower = text.toLowerCase();
  const needle = q.toLowerCase();
  const parts: HighlightPart[] = [];
  let from = 0;
  for (;;) {
    const at = lower.indexOf(needle, from);
    if (at < 0) break;
    if (at > from) parts.push({ text: text.slice(from, at), match: false });
    parts.push({ text: text.slice(at, at + needle.length), match: true });
    from = at + needle.length;
  }
  if (from < text.length) parts.push({ text: text.slice(from), match: false });
  return parts;
}
