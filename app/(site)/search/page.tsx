import type { Metadata } from "next";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { getPublicMenuTree } from "@/lib/menus/queries";
import { type MenuNode, postPath } from "@/lib/menus/tree";
import { highlightParts } from "@/lib/search/highlight";
import { SEARCH_MAX_LENGTH, SEARCH_MIN_LENGTH, searchPosts } from "@/lib/search/search";

export const metadata: Metadata = { title: "검색", robots: { index: false } };

function Highlight({ text, query }: { text: string; query: string }) {
  return (
    <>
      {highlightParts(text, query).map((part, i) =>
        part.match ? (
          <mark key={i} className="rounded-sm bg-yellow-200 px-0.5 text-inherit">
            {part.text}
          </mark>
        ) : (
          <span key={i}>{part.text}</span>
        ),
      )}
    </>
  );
}

/** 통합 검색(F-10): 제목·본문, 메뉴 필터, 검색어 강조 */
export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; menu?: string }>;
}) {
  const params = await searchParams;
  const q = (params.q ?? "").trim().slice(0, SEARCH_MAX_LENGTH);
  const tree = await getPublicMenuTree();

  // 글을 담는 공개 메뉴(게시글·게시판)와 그 상위 그룹
  const menus = new Map<string, { menu: MenuNode; parent: MenuNode | null }>();
  for (const node of tree) {
    if (node.type === "series" || node.type === "board")
      menus.set(node.id, { menu: node, parent: null });
    for (const child of node.children) {
      if (child.is_active && (child.type === "series" || child.type === "board")) {
        menus.set(child.id, { menu: child, parent: node });
      }
    }
  }
  const menuId = params.menu && menus.has(params.menu) ? params.menu : undefined;
  const tooShort = q.length > 0 && q.length < SEARCH_MIN_LENGTH;
  // 상위 그룹이 비활성인 메뉴 등 공개 주소가 없는 글은 뺀다.
  const hits =
    q && !tooShort ? (await searchPosts(q, menuId)).filter((h) => menus.has(h.menuId)) : [];
  const label = (id: string) => {
    const m = menus.get(id)!;
    return m.parent ? `${m.parent.title} › ${m.menu.title}` : m.menu.title;
  };

  return (
    <div className="container-site flex max-w-3xl flex-col gap-6 py-10 sm:py-14">
      <h1 className="text-2xl font-bold sm:text-3xl">검색</h1>
      <form method="get" role="search" className="flex flex-wrap gap-2">
        <label htmlFor="q" className="sr-only">
          검색어
        </label>
        <input
          id="q"
          type="search"
          name="q"
          defaultValue={q}
          minLength={SEARCH_MIN_LENGTH}
          maxLength={SEARCH_MAX_LENGTH}
          placeholder="예: 반복문, 인공지능 윤리"
          className="h-11 min-w-0 flex-1 basis-60 rounded-lg border bg-background px-3 text-base"
        />
        <label htmlFor="menu" className="sr-only">
          메뉴
        </label>
        <select
          id="menu"
          name="menu"
          defaultValue={menuId ?? ""}
          className="h-11 rounded-lg border bg-background px-2 text-base"
        >
          <option value="">전체 메뉴</option>
          {[...menus.keys()].map((id) => (
            <option key={id} value={id}>
              {label(id)}
            </option>
          ))}
        </select>
        <Button type="submit" className="h-11 px-5">
          검색
        </Button>
      </form>

      {tooShort && (
        <p className="text-sm text-muted-foreground">
          검색어를 {SEARCH_MIN_LENGTH}글자 이상 입력해 주세요.
        </p>
      )}

      {q && !tooShort && (
        <section aria-labelledby="results-heading" className="flex flex-col gap-3">
          <h2 id="results-heading" className="text-sm text-muted-foreground">
            &lsquo;{q}&rsquo; 검색 결과 {hits.length}건
          </h2>
          {hits.length === 0 ? (
            <p className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">
              찾는 자료가 없습니다. 다른 낱말로 검색해 보세요.
            </p>
          ) : (
            <ul aria-label="검색 결과" className="flex flex-col gap-3">
              {hits.map((hit) => {
                const { menu, parent } = menus.get(hit.menuId)!;
                return (
                  <li key={hit.id}>
                    <Link
                      href={postPath(menu, parent, hit.slug)}
                      className="flex flex-col gap-1 rounded-xl border p-4 hover:bg-muted/50"
                    >
                      <span className="text-xs text-muted-foreground">
                        {label(hit.menuId)}
                        {hit.lessonNo !== null && ` · ${hit.lessonNo}차시`}
                      </span>
                      <span className="font-semibold break-keep">
                        <Highlight text={hit.title} query={q} />
                      </span>
                      {hit.snippet && (
                        <span className="line-clamp-3 text-sm break-keep text-muted-foreground">
                          <Highlight text={hit.snippet} query={q} />
                          {hit.snippet.length >= 200 && "…"}
                        </span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
