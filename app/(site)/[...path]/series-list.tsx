import Link from "next/link";

import type { MenuNode } from "@/lib/menus/tree";
import { postPath } from "@/lib/menus/tree";
import type { PublicPostSummary } from "@/lib/posts/public";

import { Breadcrumb } from "./breadcrumb";

/** 차시 목록(F-07): 번호·제목·요약 */
export function SeriesList({
  menu,
  parent,
  posts,
}: {
  menu: MenuNode;
  parent: MenuNode | null;
  posts: PublicPostSummary[];
}) {
  return (
    <div className="container-site flex max-w-3xl flex-col gap-6 py-10 sm:py-14">
      <Breadcrumb items={[...(parent ? [{ label: parent.title }] : []), { label: menu.title }]} />
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold break-keep sm:text-3xl">{menu.title}</h1>
        <p className="text-sm text-muted-foreground">차시 {posts.length}개</p>
      </header>
      {posts.length === 0 ? (
        <p className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">
          아직 공개된 차시가 없습니다.
        </p>
      ) : (
        <ol aria-label="차시 목록" className="flex flex-col gap-3">
          {posts.map((post) => (
            <li key={post.id}>
              <Link
                href={postPath(menu, parent, post.slug)}
                className="group flex gap-4 rounded-xl border p-4 transition-colors hover:bg-muted/50"
              >
                <span
                  className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-sm font-semibold text-muted-foreground"
                  aria-hidden={post.lessonNo === null}
                >
                  {post.lessonNo ?? "·"}
                </span>
                <span className="flex min-w-0 flex-col gap-1">
                  <span className="font-semibold break-keep group-hover:underline">
                    {post.lessonNo !== null && (
                      <span className="sr-only">{post.lessonNo}차시 </span>
                    )}
                    {post.title}
                  </span>
                  {post.summary && (
                    <span className="line-clamp-2 text-sm text-muted-foreground">
                      {post.summary}
                    </span>
                  )}
                </span>
              </Link>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
