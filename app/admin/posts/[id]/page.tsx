import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";

import { requireAdmin } from "@/lib/auth/current-user";
import { getPostForEditor } from "@/lib/posts/editor";

import { EditorShell } from "./editor-shell";

export const metadata: Metadata = { title: "게시물 편집" };

export default async function EditPostPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireAdmin(`/admin/posts/${id}`);
  if (!z.uuid().safeParse(id).success) notFound();
  const post = await getPostForEditor(id);
  if (!post) notFound();

  return <EditorShell post={post} />;
}
