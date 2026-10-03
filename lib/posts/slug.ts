/**
 * 같은 메뉴에 이미 있는 주소(slug)와 겹치지 않게 뒤에 -2, -3…을 붙인다.
 * 주소는 최대 50자(menuSlugSchema)이므로 넘치면 앞부분을 줄인다.
 */
export function pickUniqueSlug(base: string, taken: ReadonlySet<string>, maxLength = 50): string {
  if (!taken.has(base)) return base;
  for (let n = 2; ; n++) {
    const suffix = `-${n}`;
    const candidate = `${base.slice(0, maxLength - suffix.length).replace(/-+$/, "")}${suffix}`;
    if (!taken.has(candidate)) return candidate;
  }
}
