import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

import {
  adminClient,
  createMember,
  deleteTestUser,
  hasSupabase,
  loginAs,
  randomSuffix,
  userClient,
} from "./helpers/supabase";

// DB 권한만 검사하므로 데스크톱 프로젝트에서만 실행한다.
test.describe("RLS: posts·post_revisions·attachments", () => {
  test.skip(({ isMobile }) => isMobile || !hasSupabase, "데스크톱 + Supabase 환경에서만");

  const prefix = `e2e-${randomSuffix()}`;
  let student: { id: string; email: string };
  let teacher: { id: string; email: string };
  let admin: { id: string; email: string };
  let menuId: string;
  let publishedId: string;
  let draftId: string;

  test.beforeAll(async ({}, testInfo) => {
    // 테스트가 건너뛰어지는 프로젝트에서는 데이터도 만들지 않는다.
    if (testInfo.project.name === "mobile" || !hasSupabase) return;
    student = await createMember();
    teacher = await createMember({
      role: "teacher",
      teacher_status: "approved",
      teacher_school: "테스트학교",
      teacher_position: "교사",
      teacher_subject: "정보",
    });
    admin = await createMember({ role: "admin" });

    const db = adminClient();
    const { data: menu, error } = await db
      .from("menus")
      .insert({ slug: prefix, title: "테스트 메뉴", type: "series" })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    menuId = menu.id;

    const { data: posts, error: postError } = await db
      .from("posts")
      .insert([
        {
          menu_id: menuId,
          title: "공개 글",
          slug: "pub",
          status: "published",
          content: [{ id: "t1", type: "teacherBox", props: {}, content: [], children: [] }],
          content_text: "공개 본문",
          author_id: admin.id,
        },
        {
          menu_id: menuId,
          title: "초안 글",
          slug: "draft",
          status: "draft",
          content: [],
          content_text: "",
          author_id: admin.id,
        },
      ])
      .select("id, slug");
    if (postError) throw new Error(postError.message);
    publishedId = posts.find((p) => p.slug === "pub")!.id;
    draftId = posts.find((p) => p.slug === "draft")!.id;
    await db.from("post_revisions").insert({ post_id: publishedId, title: "이력", content: [] });
  });

  test.afterAll(async () => {
    const db = adminClient();
    if (menuId) {
      await db.from("posts").delete().eq("menu_id", menuId);
      await db.from("menus").delete().eq("id", menuId);
    }
    for (const u of [student, teacher, admin]) if (u) await deleteTestUser(u.id);
  });

  function anonClient() {
    return createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false } },
    );
  }

  test("비회원은 공개 글의 목록 정보만 읽고 본문·초안·이력은 못 읽는다", async () => {
    const anon = anonClient();
    const { data } = await anon.from("posts").select("id, title").eq("menu_id", menuId);
    expect(data?.map((p) => p.id)).toEqual([publishedId]);

    for (const columns of ["content", "draft_content", "*"]) {
      const { error } = await anon.from("posts").select(columns).eq("id", publishedId);
      expect(error, `${columns}는 차단돼야 함`).not.toBeNull();
    }
    const rpc = await anon.rpc("get_post_editor_content", { p_post_id: publishedId });
    expect(rpc.error).not.toBeNull();

    for (const table of ["post_revisions", "attachments"]) {
      const { data: rows } = await anon.from(table).select("id");
      expect(rows ?? []).toHaveLength(0);
    }
  });

  test("교사·학생도 본문 컬럼을 직접 읽거나 글을 쓸 수 없다", async () => {
    for (const user of [student, teacher]) {
      const client = await userClient(user.email);
      const { error } = await client.from("posts").select("content").eq("id", publishedId);
      expect(error).not.toBeNull();

      const rpc = await client.rpc("get_post_editor_content", { p_post_id: publishedId });
      expect(rpc.error).not.toBeNull();

      const { data: drafts } = await client.from("posts").select("id").eq("id", draftId);
      expect(drafts).toHaveLength(0);

      const insert = await client
        .from("posts")
        .insert({ menu_id: menuId, title: "x", slug: `x-${randomSuffix()}` });
      expect(insert.error).not.toBeNull();

      const update = await client
        .from("posts")
        .update({ title: "바뀜" })
        .eq("id", publishedId)
        .select("id");
      expect(update.data ?? []).toHaveLength(0);

      const { data: revisions } = await client.from("post_revisions").select("id");
      expect(revisions ?? []).toHaveLength(0);
    }
  });

  test("관리자는 초안과 본문(RPC)까지 읽는다", async () => {
    const client = await userClient(admin.email);
    const { data } = await client.from("posts").select("id").eq("menu_id", menuId);
    expect(data).toHaveLength(2);

    const { data: content, error } = await client.rpc("get_post_editor_content", {
      p_post_id: publishedId,
    });
    expect(error).toBeNull();
    expect((content?.[0]?.content as { type: string }[])[0].type).toBe("teacherBox");
  });

  test("파일 버킷은 공개 읽기이고 SVG·HTML은 받지 않는다", async () => {
    const { data: bucket } = await adminClient().storage.getBucket("post-files");
    expect(bucket?.public).toBe(true);
    expect(bucket?.allowed_mime_types).toContain("image/png");
    expect(bucket?.allowed_mime_types).not.toContain("image/svg+xml");
    expect(bucket?.allowed_mime_types).not.toContain("text/html");
  });

  test("학생은 파일 버킷에 직접 업로드할 수 없다", async () => {
    const client = await userClient(student.email);
    const { error } = await client.storage
      .from("post-files")
      .upload(`${prefix}/x.png`, new Blob(["x"], { type: "image/png" }));
    expect(error).not.toBeNull();
  });
});

test.describe("휴지통 자동 삭제 Cron", () => {
  test.skip(({ isMobile }) => isMobile, "데스크톱에서만");

  test("인증 없이 호출하면 거부한다", async ({ request }) => {
    const res = await request.get("/api/cron/purge-trash");
    expect([401, 503]).toContain(res.status());
    const wrong = await request.get("/api/cron/purge-trash", {
      headers: { authorization: "Bearer wrong-secret-value-123" },
    });
    expect([401, 503]).toContain(wrong.status());
  });
});

test.describe("게시물이 있는 메뉴 삭제", () => {
  test.skip(({ isMobile }) => isMobile || !hasSupabase, "데스크톱 + Supabase 환경에서만");

  const prefix = `e2e-${randomSuffix()}`;
  let admin: { id: string; email: string };
  let menuId: string;

  test.beforeAll(async ({}, testInfo) => {
    if (testInfo.project.name === "mobile" || !hasSupabase) return;
    admin = await createMember({ role: "admin" });
    const db = adminClient();
    const { data: menu, error } = await db
      .from("menus")
      .insert({
        slug: prefix,
        title: `글있는${prefix.slice(-4)}`,
        type: "series",
        is_active: false,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    menuId = menu.id;
    await db.from("posts").insert({ menu_id: menuId, title: "글", slug: "a" });
  });

  test.afterAll(async () => {
    const db = adminClient();
    if (menuId) {
      await db.from("posts").delete().eq("menu_id", menuId);
      await db.from("menus").delete().eq("id", menuId);
    }
    if (admin) await deleteTestUser(admin.id);
  });

  test("관리자 화면에서 삭제하면 게시물 처리 방법을 묻고, 취소하면 그대로 둔다", async ({
    page,
    context,
    baseURL,
  }) => {
    await loginAs(context, admin.email, baseURL!);
    await page.goto("/admin/menus");
    const title = `글있는${prefix.slice(-4)}`;
    await page.getByRole("button", { name: `삭제: ${title}` }).click();
    await page.getByRole("button", { name: "삭제", exact: true }).click();
    // 바로 지우지 않고 게시물 처리 방법을 묻는다. 취소하면 메뉴는 그대로다.
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText("게시물이 1개 있습니다")).toBeVisible();
    await dialog.getByRole("button", { name: "취소" }).click();
    const { data } = await adminClient().from("menus").select("id").eq("id", menuId);
    expect(data).toHaveLength(1);
  });
});
