import { expect, test } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import {
  adminClient,
  createMember,
  deleteTestUser,
  hasSupabase,
  randomSuffix,
  userClient,
} from "./helpers/supabase";

type User = { id: string; email: string };

/*
 * P5-3 게시판 업로드 기록·글 저장 함수의 DB 권한(RLS·트리거·RPC).
 * Storage 파일 없이 attachments 기록만 다룬다(파일 검사는 서버 액션 몫).
 */
test.describe.serial("RLS: 게시판 업로드(attachments)·글 저장 함수", () => {
  test.skip(({ isMobile }) => isMobile || !hasSupabase, "데스크톱 + Supabase 환경에서만");

  const prefix = `e2e-${randomSuffix()}`;
  const users: User[] = [];
  let writer: User;
  let other: User;
  let pending: User;
  let boardId: string;
  let seriesId: string;
  let writerDb: SupabaseClient;
  let otherDb: SupabaseClient;

  const db = () => adminClient();
  const upload = (owner: User, name: string, values: Record<string, unknown> = {}) => ({
    storage_path: `board/${owner.id}/${name}`,
    file_name: name,
    mime_type: "image/png",
    size_bytes: 100,
    ...values,
  });

  async function member(overrides: Record<string, unknown> = {}) {
    const user = await createMember(overrides);
    users.push(user);
    return user;
  }

  async function insertMenu(slug: string, values: Record<string, unknown>) {
    const { data, error } = await db()
      .from("menus")
      .insert({ slug: `${prefix}-${slug}`, title: `테스트 ${slug}`, ...values })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return data.id as string;
  }

  test.beforeAll(async ({}, testInfo) => {
    if (testInfo.project.name === "mobile" || !hasSupabase) return;
    writer = await member();
    other = await member();
    pending = await member({
      is_under_14: true,
      guardian_email: "p@example.com",
      status: "pending_guardian",
    });
    boardId = await insertMenu("free", { type: "board", board_write_role: "student" });
    seriesId = await insertMenu("series", { type: "series" });
    writerDb = await userClient(writer.email);
    otherDb = await userClient(other.email);
  });

  test.afterAll(async () => {
    const ids = users.map((u) => u.id);
    if (ids.length) await db().from("attachments").delete().in("uploaded_by", ids);
    const menuIds = [boardId, seriesId].filter(Boolean);
    if (menuIds.length) {
      await db().from("posts").delete().in("menu_id", menuIds);
      await db().from("menus").delete().in("id", menuIds);
    }
    for (const u of users) await deleteTestUser(u.id);
  });

  test("업로드 기록: 본인 경로에만, 글 연결 없이, 본인 기록만 보인다", async () => {
    // post_id를 넣어 보내도 트리거가 비운다.
    const { error } = await writerDb
      .from("attachments")
      .insert(upload(writer, "a.png", { post_id: null, uploaded_by: other.id }));
    expect(error).toBeNull();
    const { data: mine } = await writerDb
      .from("attachments")
      .select("storage_path, uploaded_by, post_id");
    expect(mine).toEqual([
      { storage_path: `board/${writer.id}/a.png`, uploaded_by: writer.id, post_id: null },
    ]);

    // 남의 경로, 경로 밖
    expect(
      (await writerDb.from("attachments").insert(upload(other, "x.png"))).error,
    ).not.toBeNull();
    expect(
      (
        await writerDb
          .from("attachments")
          .insert({ ...upload(writer, "y.png"), storage_path: `posts/${writer.id}/y.png` })
      ).error,
    ).not.toBeNull();

    // 다른 회원은 내 기록을 못 본다
    const { data: seen } = await otherDb.from("attachments").select("id");
    expect(seen).toEqual([]);

    // 비회원·보호자 동의 대기 회원은 기록할 수 없다
    const anon = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false } },
    );
    expect((await anon.from("attachments").insert(upload(pending, "n.png"))).error).not.toBeNull();
    const waiting = await userClient(pending.email);
    const { error: pendingError } = await waiting
      .from("attachments")
      .insert(upload(pending, "p.png"));
    expect(pendingError).not.toBeNull();
  });

  test("하루 한도: 최근 24시간 업로드가 한도에 닿으면 P0429", async () => {
    const { data: limit } = await writerDb.rpc("board_upload_daily_limit");
    expect(typeof limit).toBe("number");
    // 한도까지 채운다(서비스 역할은 트리거 검사를 받지 않는다).
    const fill = Array.from({ length: limit as number }, (_, i) => ({
      ...upload(other, `fill-${i}.png`),
      uploaded_by: other.id,
    }));
    if (fill.length) {
      const { error } = await db().from("attachments").insert(fill);
      expect(error).toBeNull();
    }
    const { error } = await otherDb.from("attachments").insert(upload(other, "over.png"));
    expect(error?.code).toBe("P0429");
    await db().from("attachments").delete().eq("uploaded_by", other.id);
  });

  test("글 저장: 본인 미연결 업로드만 연결하고, 남의 글은 고칠 수 없다", async () => {
    await db()
      .from("attachments")
      .insert({ ...upload(other, "theirs.png"), uploaded_by: other.id });

    const { data: postId, error } = await writerDb.rpc("create_board_post", {
      p_menu_id: boardId,
      p_slug: `w${randomSuffix()}`,
      p_title: "업로드 글",
      p_content: [],
      p_content_text: "",
      p_upload_paths: [`board/${writer.id}/a.png`, `board/${other.id}/theirs.png`],
    });
    expect(error).toBeNull();

    const { data: rows } = await db()
      .from("attachments")
      .select("storage_path, post_id")
      .in("uploaded_by", [writer.id, other.id]);
    expect(rows).toHaveLength(2);
    expect(rows).toEqual(
      expect.arrayContaining([
        { storage_path: `board/${other.id}/theirs.png`, post_id: null },
        { storage_path: `board/${writer.id}/a.png`, post_id: postId },
      ]),
    );

    // 회원 글의 관리 항목은 트리거가 정한다
    const { data: post } = await db()
      .from("posts")
      .select("author_id, status, is_pinned")
      .eq("id", postId as string)
      .single();
    expect(post).toEqual({ author_id: writer.id, status: "published", is_pinned: false });

    // 남의 글 수정 → P0002, 본인 수정 + 새 업로드 연결
    const theirs = await otherDb.rpc("update_board_post", {
      p_post_id: postId,
      p_title: "가로채기",
      p_content: [],
      p_content_text: "",
      p_upload_paths: [`board/${other.id}/theirs.png`],
    });
    expect(theirs.error?.code).toBe("P0002");

    expect((await writerDb.from("attachments").insert(upload(writer, "b.png"))).error).toBeNull();
    const mine = await writerDb.rpc("update_board_post", {
      p_post_id: postId,
      p_title: "고친 제목",
      p_content: [],
      p_content_text: "",
      p_upload_paths: [`board/${writer.id}/b.png`],
    });
    expect(mine.error).toBeNull();
    const { data: after } = await db()
      .from("posts")
      .select("title")
      .eq("id", postId as string)
      .single();
    expect(after?.title).toBe("고친 제목");
    const { data: linked } = await db()
      .from("attachments")
      .select("post_id")
      .eq("storage_path", `board/${writer.id}/b.png`)
      .single();
    expect(linked?.post_id).toBe(postId);

    // 연결된 업로드는 다른 글로 옮기거나 경로를 바꿀 수 없다
    const { data: moved } = await writerDb
      .from("attachments")
      .update({ post_id: null })
      .eq("storage_path", `board/${writer.id}/a.png`)
      .select("id");
    expect(moved ?? []).toEqual([]);
    const { error: pathError } = await writerDb
      .from("attachments")
      .update({ storage_path: "board/x.png" })
      .eq("storage_path", `board/${writer.id}/a.png`);
    expect(pathError).not.toBeNull();

    // 남의 미연결 업로드를 내 글에 붙일 수 없다
    const { data: stolen } = await writerDb
      .from("attachments")
      .update({ post_id: postId })
      .eq("storage_path", `board/${other.id}/theirs.png`)
      .select("id");
    expect(stolen ?? []).toEqual([]);
  });

  test("게시판이 아닌 메뉴에는 create_board_post로 쓸 수 없다", async () => {
    const { error } = await otherDb.rpc("create_board_post", {
      p_menu_id: seriesId,
      p_slug: `s${randomSuffix()}`,
      p_title: "차시 메뉴에",
      p_content: [],
      p_content_text: "",
      p_upload_paths: [],
    });
    expect(error?.code).toBe("P0002");
  });

  test("직접 쓰기: 허용하지 않은 블록·외부/남의 이미지·위험한 링크는 DB가 막는다", async () => {
    const base = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/post-files/`;
    const text = (value: string, styles: Record<string, boolean> = {}) => ({
      type: "text",
      text: value,
      styles,
    });
    const para = (content: unknown[], children: unknown[] = []) => ({
      id: "p",
      type: "paragraph",
      props: {},
      content,
      children,
    });
    const image = (url: string) => ({ id: "i", type: "image", props: { url }, children: [] });
    const insert = (content: unknown[]) =>
      otherDb.from("posts").insert({
        menu_id: boardId,
        title: "직접 쓰기",
        slug: `d${randomSuffix()}`,
        content,
        content_text: "",
      });

    const rejected: [string, unknown[], string][] = [
      ["교사 전용 박스", [{ id: "t", type: "teacherBox", props: {}, children: [] }], "블록"],
      ["제목 블록", [{ id: "h", type: "heading", props: {}, content: [], children: [] }], "블록"],
      ["외부 이미지", [image("https://evil.test/a.png")], "직접 올린 이미지"],
      [
        "경로만 흉내 낸 외부 주소",
        [image(`https://evil.test/storage/v1/object/public/post-files/board/${other.id}/x.png`)],
        "직접 올린 이미지",
      ],
      ["남의 업로드", [image(`${base}board/${writer.id}/a.png`)], "직접 올린 이미지"],
      ["기록 없는 본인 경로", [image(`${base}board/${other.id}/none.png`)], "직접 올린 이미지"],
      [
        "javascript: 링크",
        [para([{ type: "link", href: "javascript:alert(1)", content: [text("x")] }])],
        "링크",
      ],
      ["기울임 서식", [para([text("x", { italic: true })])], "서식"],
      ["문단 아래 블록", [para([text("x")], [para([text("y")])])], "들여쓰기"],
    ];
    for (const [name, content, message] of rejected) {
      const { error } = await insert(content);
      expect(error?.code, name).toBe("22023");
      expect(error?.message, name).toContain(message);
    }

    // 본인 업로드 + 허용 서식은 통과
    await db()
      .from("attachments")
      .insert({ ...upload(other, "ok.png"), uploaded_by: other.id });
    const { error } = await insert([
      para([
        text("안녕", { bold: true }),
        { type: "link", href: "https://example.com", content: [text("링크")] },
      ]),
      image(`${base}board/${other.id}/ok.png`),
    ]);
    expect(error).toBeNull();

    // 수정도 같은 검사. 본문을 안 바꾸는 제목 수정은 통과.
    const { data: post } = await db().from("posts").select("id").eq("author_id", other.id).single();
    const bad = await otherDb
      .from("posts")
      .update({ content: [image("https://evil.test/a.png")] })
      .eq("id", post!.id);
    expect(bad.error?.code).toBe("22023");
    const titleOnly = await otherDb.from("posts").update({ title: "제목만" }).eq("id", post!.id);
    expect(titleOnly.error).toBeNull();
  });
});
