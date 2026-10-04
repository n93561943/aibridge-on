import { expect, type Page, test } from "@playwright/test";

import {
  adminClient,
  createMember,
  deleteTestUser,
  hasSupabase,
  loginAs,
  randomSuffix,
} from "./helpers/supabase";
import { createMenuViaAdmin, deleteMenuViaAdmin } from "./helpers/menus";

// 1x1 PNG
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

/** 게시판 글쓰기·수정(F-08, P5-3) */
test.describe("게시판 글쓰기", () => {
  test.skip(!hasSupabase, "Supabase 환경변수가 필요합니다");
  // 준비(관리자 화면 로그인)가 무거워 워커마다 반복되지 않게 한 워커에서 차례로 돈다.
  test.describe.configure({ mode: "default" });

  const slug = `e2e-${randomSuffix()}`;
  const title = `자유${slug.slice(-4)}`;
  let menuId: string;
  const users: string[] = [];

  async function member(overrides: Record<string, unknown> = {}) {
    const user = await createMember(overrides);
    users.push(user.id);
    return user;
  }

  async function login(page: Page, baseURL: string, overrides: Record<string, unknown> = {}) {
    const user = await member(overrides);
    await loginAs(page.context(), user.email, baseURL);
    return user;
  }

  test.beforeAll(async ({ browser, baseURL }) => {
    menuId = await createMenuViaAdmin(browser, baseURL!, { slug, title, type: "board" });
    // 글쓰기 등급은 화면 캐시가 아니라 DB(can_write_board)로 검사하므로 바로 반영된다.
    await adminClient().from("menus").update({ board_write_role: "student" }).eq("id", menuId);
  });

  test.afterAll(async ({ browser, baseURL }) => {
    // 올린 이미지 파일과 기록을 지운다(메뉴 삭제 헬퍼는 DB 행만 지운다).
    const db = adminClient();
    if (users.length) {
      const { data: files } = await db
        .from("attachments")
        .select("storage_path")
        .in("uploaded_by", users);
      const paths = (files ?? []).map((f) => f.storage_path);
      if (paths.length) await db.storage.from("post-files").remove(paths);
      await db.from("attachments").delete().in("uploaded_by", users);
    }
    if (menuId) await deleteMenuViaAdmin(browser, baseURL!, { id: menuId, title });
    for (const id of users) await deleteTestUser(id);
  });

  test("비회원은 로그인 화면으로, 보호자 동의 대기 회원은 안내를 본다", async ({
    page,
    baseURL,
    isMobile,
  }) => {
    test.skip(isMobile, "데스크톱에서만");
    await page.goto(`/${slug}/submit`);
    await expect(page).toHaveURL(
      new RegExp(`/login\\?next=${encodeURIComponent(`/${slug}/submit`)}$`),
    );

    await login(page, baseURL!, {
      is_under_14: true,
      guardian_email: "p@example.com",
      status: "pending_guardian",
    });
    await page.goto(`/${slug}/submit`);
    await expect(page.getByText("보호자 동의를 기다리거나")).toBeVisible();
    await expect(page.getByLabel("제목")).toHaveCount(0);
  });

  test("학생: 이미지를 넣어 글을 쓰면 피드에 나오고, 1분 안에 또 쓸 수는 없다", async ({
    page,
    baseURL,
    isMobile,
  }) => {
    test.skip(isMobile, "데스크톱에서만");
    const student = await login(page, baseURL!);
    await page.goto(`/${slug}`);
    await page.getByRole("link", { name: "글쓰기", exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/${slug}/submit$`));

    await page.getByLabel("제목").fill("첫 글입니다");
    await page.locator(".bn-editor").click();
    await page.keyboard.type("안녕하세요 **굵게** 인사");
    await page.keyboard.press("Enter");
    await page.keyboard.type("/이미지");
    await page.locator(".bn-suggestion-menu-item").first().click();
    // 이미지 패널에는 업로드 탭만 있다(외부 주소 넣기 없음)
    await expect(page.locator(".bn-panel").getByRole("tab")).toHaveCount(1);
    await page
      .locator(".bn-panel input[type=file]")
      .first()
      .setInputFiles({ name: "사진.png", mimeType: "image/png", buffer: PNG });
    await expect(page.locator(".bn-editor img")).toHaveAttribute(
      "src",
      new RegExp(`/post-files/board/${student.id}/`),
    );

    // 저장하면 글 상세로 간다
    await page.getByRole("button", { name: "게시" }).click();
    await expect(page).toHaveURL(new RegExp(`/${slug}/post-[0-9a-f]{6}$`));
    const detail = page.getByRole("article", { name: "첫 글입니다" });
    await expect(detail.getByRole("heading", { level: 1 })).toHaveText("첫 글입니다");
    await expect(detail).toContainText("안녕하세요 굵게 인사");
    await expect(detail.locator("img")).toHaveAttribute(
      "src",
      new RegExp(`/post-files/board/${student.id}/`),
    );

    // 피드 카드에도 썸네일과 함께 나온다
    await page.goto(`/${slug}?sort=new`);
    await expect(page.getByRole("article", { name: "첫 글입니다" }).locator("img")).toHaveAttribute(
      "src",
      new RegExp(`/post-files/board/${student.id}/`),
    );

    // 업로드가 글에 연결되었다
    const { data: post } = await adminClient()
      .from("posts")
      .select("id, content")
      .eq("menu_id", menuId)
      .eq("author_id", student.id)
      .single();
    const { data: files } = await adminClient()
      .from("attachments")
      .select("post_id, file_name")
      .eq("uploaded_by", student.id);
    expect(files).toEqual([{ post_id: post!.id, file_name: "사진.png" }]);
    const paragraph = (post!.content as { content: unknown[] }[])[0];
    expect(paragraph.content).toContainEqual({
      type: "text",
      text: "굵게",
      styles: { bold: true },
    });

    // 1분 제한
    await page.goto(`/${slug}/submit`);
    await page.getByLabel("제목").fill("두 번째 글");
    await page.getByRole("button", { name: "게시" }).click();
    await expect(page.getByText(/1분에 1개만 쓸 수 있습니다/)).toBeVisible();
  });

  test("작성자는 글을 고칠 수 있고, 남의 글 수정 화면은 404", async ({
    page,
    baseURL,
    browser,
    isMobile,
  }) => {
    test.skip(isMobile, "데스크톱에서만");
    const author = await member();
    const postSlug = `own${randomSuffix()}`;
    const { error } = await adminClient()
      .from("posts")
      .insert({
        menu_id: menuId,
        title: "고칠 글",
        slug: postSlug,
        status: "published",
        author_id: author.id,
        content: [
          {
            id: "p1",
            type: "paragraph",
            props: {},
            content: [{ type: "text", text: "원래 본문", styles: {} }],
            children: [],
          },
        ],
        content_text: "원래 본문",
      });
    if (error) throw new Error(error.message);

    await loginAs(page.context(), author.email, baseURL!);
    await page.goto(`/${slug}/${postSlug}/edit`);
    await expect(page.getByRole("heading", { name: "글 수정" })).toBeVisible();
    await expect(page.getByLabel("제목")).toHaveValue("고칠 글");
    await expect(page.locator(".bn-editor")).toContainText("원래 본문");
    await page.getByLabel("제목").fill("고친 글");
    await page.getByRole("button", { name: "수정" }).click();
    await expect(page).toHaveURL(new RegExp(`/${slug}/${postSlug}$`));
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("고친 글");

    // 다른 회원
    const context = await browser.newContext({ baseURL });
    try {
      const stranger = await member();
      await loginAs(context, stranger.email, baseURL!);
      const other = await context.newPage();
      const res = await other.goto(`/${slug}/${postSlug}/edit`);
      expect(res?.status()).toBe(404);
    } finally {
      await context.close();
    }
  });

  test("390px에서 글쓰기 화면이 넘치지 않는다", async ({ page, baseURL, isMobile }) => {
    test.skip(!isMobile, "모바일 전용");
    await login(page, baseURL!);
    await page.goto(`/${slug}/submit`);
    await expect(page.locator(".bn-editor")).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
