import Link from "next/link";

import type { OwnBoardPost, WriteAccess } from "@/lib/board/write";
import { writeAccessMessages } from "@/lib/board/write";
import type { MenuNode } from "@/lib/menus/tree";

import { BoardWriteForm } from "./board-write-form";
import { Breadcrumb } from "./breadcrumb";

/** 게시판 글쓰기(/메뉴/submit)·수정(/메뉴/글/edit) 화면 */
export function BoardWritePage({
  menu,
  parent,
  boardPath,
  access,
  post,
}: {
  menu: MenuNode;
  parent: MenuNode | null;
  boardPath: string;
  access: WriteAccess;
  /** 수정할 본인 글. 없으면 새 글 */
  post?: OwnBoardPost;
}) {
  const heading = post ? "글 수정" : "글쓰기";
  return (
    <div className="container-site flex max-w-3xl flex-col gap-6 py-8 sm:py-12">
      <Breadcrumb
        items={[
          ...(parent ? [{ label: parent.title }] : []),
          { label: menu.title, href: boardPath },
          { label: heading },
        ]}
      />
      <h1 className="text-2xl font-bold sm:text-3xl">{heading}</h1>
      {access.ok ? (
        <BoardWriteForm
          menuId={menu.id}
          postId={post?.id}
          initialTitle={post?.title}
          initialContent={post?.content}
          cancelHref={boardPath}
        />
      ) : (
        <div className="flex flex-col items-start gap-3 rounded-xl border border-dashed p-6">
          <p>{writeAccessMessages[access.reason]}</p>
          <Link href={boardPath} className="text-sm font-medium underline underline-offset-4">
            목록으로 돌아가기
          </Link>
        </div>
      )}
    </div>
  );
}
