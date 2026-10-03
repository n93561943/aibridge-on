import { expect, type Page, test } from "@playwright/test";

import {
  adminClient,
  createMember,
  deleteTestUser,
  hasSupabase,
  loginAs,
  randomSuffix,
} from "./helpers/supabase";

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

type Menu = { id: string; slug: string; title: string };

test.describe("게시물 관리·휴지통", () => {
  test.skip(!hasSupabase, "Supabase 환경변수가 필요합니다");

  let admin: { id: string; email: string };
  let tag: string;
  let series: Menu;
  let series2: Menu;
  let board: Menu;

  async function makeMenu(key: string, label: string, type: "series" | "board"): Promise<Menu> {
    const slug = `e2e-${tag}-${key}`;
    const title = `${label}${tag}`;
    const { data, error } = await adminClient()
      .from("menus")
      .insert({
        slug,
        title,
        type,
        is_active: false,
        ...(type === "board" ? { board_write_role: "admin" } : {}),
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: data.id, slug, title };
  }

  async function makePosts(menuId: string, titles: string[]) {
    const { data, error } = await adminClient()
      .from("posts")
      .insert(
        titles.map((title, i) => ({
          menu_id: menuId,
          title,
          slug: `p${i + 1}`,
          sort_order: i + 1,
          content: [],
          content_text: "",
          status: "draft",
        })),
      )
      .select("id, title");
    if (error) throw new Error(error.message);
    return data;
  }

  test.beforeEach(async ({ context, baseURL }) => {
    tag = randomSuffix();
    admin = await createMember({ role: "admin" });
    await loginAs(context, admin.email, baseURL!);
    series = await makeMenu("a", "가", "series");
    series2 = await makeMenu("b", "나", "series");
    board = await makeMenu("c", "판", "board");
  });

  test.afterEach(async () => {
    const db = adminClient();
    const { data: posts } = await db
      .from("posts")
      .select("id")
      .or(
        `menu_id.in.(${[series, series2, board]
          .filter(Boolean)
          .map((m) => m.id)
          .join(",")}),title.like.*${tag}*`,
      );
    const ids = (posts ?? []).map((p) => p.id);
    if (ids.length) {
      const { data: files } = await db
        .from("attachments")
        .select("storage_path")
        .in("post_id", ids);
      if (files?.length)
        await db.storage.from("post-files").remove(files.map((f) => f.storage_path));
      await db.from("posts").delete().in("id", ids);
    }
    await db.from("menus").delete().like("slug", `e2e-${tag}-%`);
    if (admin) await deleteTestUser(admin.id);
  });

  const listTitles = (page: Page) =>
    page.getByRole("list", { name: "게시물 목록" }).getByRole("link").allInnerTexts();

  test("메뉴·상태 필터와 제목 검색", async ({ page }) => {
    await makePosts(series.id, [`인공지능${tag}`, `데이터${tag}`]);
    await makePosts(series2.id, [`코딩${tag}`]);

    await page.goto(`/admin/posts?menu=${series.id}`);
    expect((await listTitles(page)).join()).toContain(`인공지능${tag}`);
    expect((await listTitles(page)).join()).not.toContain(`코딩${tag}`);

    await page.goto(`/admin/posts?q=${encodeURIComponent(`데이터${tag}`)}`);
    const titles = await listTitles(page);
    expect(titles).toHaveLength(1);
    expect(titles[0]).toContain(`데이터${tag}`);

    await page.goto(`/admin/posts?menu=${series.id}&status=published`);
    await expect(page.getByText("조건에 맞는 게시물이 없습니다.")).toBeVisible();
  });

  test("여러 개 선택 → 게시판으로 이동(형식 경고) → 주소가 겹치면 -2", async ({ page }) => {
    const posts = await makePosts(series.id, [`하나${tag}`, `둘${tag}`]);
    await makePosts(board.id, [`기존${tag}`]); // slug p1이 이미 있음

    await page.goto(`/admin/posts?menu=${series.id}`);
    await page.getByLabel(`선택: 하나${tag}`).check();
    await page.getByLabel(`선택: 둘${tag}`).check();
    await page.getByLabel("옮길 메뉴").selectOption(board.id);

    let warned = false;
    page.once("dialog", async (d) => {
      warned = d.message().includes("형식이 다릅니다");
      await d.accept();
    });
    await page.getByRole("button", { name: "이동", exact: true }).click();
    await expect(page.getByRole("status").filter({ hasText: "2개를" })).toBeVisible();
    expect(warned).toBe(true);

    const { data } = await adminClient()
      .from("posts")
      .select("id, menu_id, slug")
      .in(
        "id",
        posts.map((p) => p.id),
      )
      .order("sort_order");
    expect(data?.every((p) => p.menu_id === board.id)).toBe(true);
    expect(data?.map((p) => p.slug).sort()).toEqual(["p1-2", "p2"]);
  });

  test("휴지통으로 → 복구 → 영구 삭제(파일 포함)", async ({ page }) => {
    const [post] = await makePosts(series.id, [`버릴글${tag}`]);
    const path = `${post.id}/e2e.png`;
    const db = adminClient();
    await db.storage.from("post-files").upload(path, PNG, { contentType: "image/png" });
    await db.from("attachments").insert({
      post_id: post.id,
      storage_path: path,
      file_name: "e2e.png",
      mime_type: "image/png",
      size_bytes: PNG.length,
    });

    await page.goto(`/admin/posts?menu=${series.id}`);
    await page.getByRole("button", { name: `휴지통으로: 버릴글${tag}` }).click();
    await expect(
      page.getByRole("status").filter({ hasText: "휴지통으로 보냈습니다" }),
    ).toBeVisible();

    await page.goto("/admin/trash");
    await expect(page.getByText(`버릴글${tag}`)).toBeVisible();
    await expect(page.getByText(/30일 뒤 영구 삭제/).first()).toBeVisible();
    await page.getByLabel(`선택: 버릴글${tag}`).check();
    await page.getByRole("button", { name: "복구" }).click();
    await expect(page.getByRole("status").filter({ hasText: "복구했습니다" })).toBeVisible();
    expect(
      (await db.from("posts").select("deleted_at").eq("id", post.id).single()).data?.deleted_at,
    ).toBeNull();

    // 다시 휴지통 → 영구 삭제
    await db.from("posts").update({ deleted_at: new Date().toISOString() }).eq("id", post.id);
    await page.goto("/admin/trash");
    await page.getByLabel(`선택: 버릴글${tag}`).check();
    page.once("dialog", (d) => d.accept());
    await page.getByRole("button", { name: "영구 삭제" }).click();
    await expect(page.getByRole("status").filter({ hasText: "영구 삭제했습니다" })).toBeVisible();
    expect((await db.from("posts").select("id").eq("id", post.id)).data).toHaveLength(0);
    const { data: exists } = await db.storage.from("post-files").exists(path);
    expect(exists).toBe(false);
  });

  test("복제하면 초안 사본과 첨부 파일 사본이 생긴다", async ({ page }) => {
    const [post] = await makePosts(series.id, [`원본${tag}`]);
    const db = adminClient();
    const path = `${post.id}/orig.png`;
    await db.storage.from("post-files").upload(path, PNG, { contentType: "image/png" });
    const url = db.storage.from("post-files").getPublicUrl(path).data.publicUrl;
    await db.from("attachments").insert({
      post_id: post.id,
      storage_path: path,
      file_name: "orig.png",
      mime_type: "image/png",
      size_bytes: PNG.length,
    });
    await db
      .from("posts")
      .update({
        status: "published",
        content: [{ id: "i1", type: "image", props: { url, caption: "" }, children: [] }],
      })
      .eq("id", post.id);

    await page.goto(`/admin/posts?menu=${series.id}`);
    await page.getByRole("button", { name: `복제: 원본${tag}` }).click();
    await expect(page.getByRole("status").filter({ hasText: "(사본)" })).toBeVisible();

    const { data: copy } = await db
      .from("posts")
      .select("id, status, slug, content")
      .eq("title", `원본${tag} (사본)`)
      .single();
    expect(copy?.status).toBe("draft");
    expect(copy?.slug).toBe("p1-copy");
    const { data: copyFiles } = await db
      .from("attachments")
      .select("storage_path")
      .eq("post_id", copy!.id);
    expect(copyFiles).toHaveLength(1);
    expect(copyFiles![0].storage_path.startsWith(`${copy!.id}/`)).toBe(true);
    expect(JSON.stringify(copy!.content)).toContain(copyFiles![0].storage_path);
    expect(JSON.stringify(copy!.content)).not.toContain(path);
  });

  test("키보드로 차시 순서를 바꾸면 저장된다", async ({ page, isMobile }) => {
    test.skip(isMobile, "키보드 조작은 데스크톱에서만");
    await makePosts(series.id, [`첫째${tag}`, `둘째${tag}`, `셋째${tag}`]);
    await page.goto(`/admin/posts?menu=${series.id}`);
    const handle = page.getByRole("button", { name: `순서 바꾸기: 첫째${tag}` });
    await handle.focus();
    // dnd-kit은 키 입력마다 위치를 다시 계산하므로 사이에 잠깐 기다린다.
    for (const key of ["Space", "ArrowDown", "ArrowDown", "Space"]) {
      await page.keyboard.press(key);
      await page.waitForTimeout(150);
    }
    await expect(page.getByRole("status").filter({ hasText: "순서를 바꿨습니다" })).toBeVisible();
    const { data } = await adminClient()
      .from("posts")
      .select("title")
      .eq("menu_id", series.id)
      .order("sort_order");
    expect(data?.map((p) => p.title)).toEqual([`둘째${tag}`, `셋째${tag}`, `첫째${tag}`]);
  });

  test("게시물이 있는 메뉴 삭제: 다른 메뉴로 옮긴 뒤 삭제 / 함께 휴지통으로", async ({ page }) => {
    await makePosts(series.id, [`옮길글${tag}`]);
    await makePosts(series2.id, [`버릴글${tag}`]);
    const db = adminClient();

    await page.goto("/admin/menus");
    await page.getByRole("button", { name: `삭제: ${series.title}` }).click();
    await page.getByRole("button", { name: "삭제", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText("게시물이 1개 있습니다")).toBeVisible();
    await dialog.getByLabel("옮길 메뉴").selectOption(series2.id);
    await dialog.getByRole("button", { name: "옮기고 메뉴 삭제" }).click();
    await expect(page.getByRole("status").filter({ hasText: "옮겼습니다" })).toBeVisible();
    const moved = await db.from("posts").select("menu_id").eq("title", `옮길글${tag}`).single();
    expect(moved.data?.menu_id).toBe(series2.id);

    await page.getByRole("button", { name: `삭제: ${series2.title}` }).click();
    await page.getByRole("button", { name: "삭제", exact: true }).click();
    await page.getByRole("dialog").getByLabel("함께 휴지통으로").check();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "휴지통으로 보내고 메뉴 삭제" })
      .click();
    await expect(page.getByRole("status").filter({ hasText: "휴지통에 있습니다" })).toBeVisible();
    const { data: trashed } = await db
      .from("posts")
      .select("menu_id, deleted_at")
      .like("title", `%${tag}`);
    expect(trashed?.every((p) => p.menu_id === null && p.deleted_at !== null)).toBe(true);

    // 메뉴가 사라진 글은 복구할 메뉴를 골라야 한다
    await page.goto("/admin/trash");
    await page.getByLabel(`선택: 버릴글${tag}`).check();
    await page.getByRole("button", { name: "복구" }).click();
    await expect(page.getByRole("status").filter({ hasText: "복구할 메뉴를 골라" })).toBeVisible();
    await page.getByLabel("복구할 메뉴").selectOption(board.id);
    await page.getByRole("button", { name: "복구" }).click();
    await expect(page.getByRole("status").filter({ hasText: "복구했습니다" })).toBeVisible();
    const restored = await db
      .from("posts")
      .select("menu_id, deleted_at")
      .eq("title", `버릴글${tag}`)
      .single();
    expect(restored.data).toEqual({ menu_id: board.id, deleted_at: null });
  });

  test("목록·휴지통 화면이 390px에서 넘치지 않는다", async ({ page }) => {
    await makePosts(series.id, [`아주 긴 제목의 차시 문서 예시입니다 ${tag}`]);
    for (const path of [`/admin/posts?menu=${series.id}`, "/admin/trash", "/admin/menus"]) {
      await page.goto(path);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, path).toBeLessThanOrEqual(0);
    }
  });
});
