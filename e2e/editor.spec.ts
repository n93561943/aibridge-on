import { expect, type Page, test } from "@playwright/test";

import {
  adminClient,
  createMember,
  deleteTestUser,
  hasSupabase,
  loginAs,
  randomSuffix,
} from "./helpers/supabase";

// 1x1 PNG
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

async function readPost(id: string) {
  const { data } = await adminClient()
    .from("posts")
    .select("title, status, content, content_text, draft_title, draft_content")
    .eq("id", id)
    .single();
  return data!;
}

async function waitSaved(page: Page) {
  await expect(page.getByRole("status").filter({ hasText: /^저장됨/ })).toBeVisible({
    timeout: 15_000,
  });
}

test.describe("게시물 에디터", () => {
  test.skip(!hasSupabase, "Supabase 환경변수가 필요합니다");

  const prefix = `e2e-${randomSuffix()}`;
  let admin: { id: string; email: string };
  let menuId: string;

  test.beforeEach(async ({ context, baseURL }) => {
    admin = await createMember({ role: "admin" });
    await loginAs(context, admin.email, baseURL!);
    const { data, error } = await adminClient()
      .from("menus")
      .insert({
        slug: `${prefix}-${randomSuffix()}`,
        title: "에디터 테스트",
        type: "series",
        is_active: false,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    menuId = data.id;
  });

  test.afterEach(async () => {
    const db = adminClient();
    if (menuId) {
      const { data: posts } = await db.from("posts").select("id").eq("menu_id", menuId);
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
      await db.from("menus").delete().eq("id", menuId);
    }
    if (admin) await deleteTestUser(admin.id);
  });

  async function createPost(page: Page, title: string) {
    await page.goto(`/admin/posts/new?menu=${menuId}`);
    await page.getByLabel("제목").fill(title);
    await page.getByRole("button", { name: "초안 만들고 에디터 열기" }).click();
    await expect(page).toHaveURL(/\/admin\/posts\/[0-9a-f-]{36}$/);
    await expect(page.locator(".bn-editor")).toBeVisible();
    return page.url().split("/").pop()!;
  }

  test("마크다운 입력 → 자동 저장 → 공개 → 수정본 → 변경 사항 공개 → 이력 복원", async ({
    page,
  }) => {
    const id = await createPost(page, "1차시 인공지능");

    // 마크다운 단축 입력
    await page.locator(".bn-editor").click();
    await page.keyboard.type("## 학습 목표");
    await page.keyboard.press("Enter");
    await page.keyboard.type("인공지능을 설명할 수 있다.");
    await page.keyboard.press("Enter");
    await page.keyboard.type("- 첫 번째 활동");
    await waitSaved(page);

    let post = await readPost(id);
    const types = (post.content as { type: string }[]).map((b) => b.type);
    expect(types).toContain("heading");
    expect(types).toContain("bulletListItem");
    expect(post.content_text).toContain("인공지능을 설명할 수 있다.");

    // 공개
    await page.getByRole("button", { name: "공개하기" }).click();
    await expect(page.getByText("공개 중", { exact: true })).toBeVisible();
    expect((await readPost(id)).status).toBe("published");

    // 공개 글 수정 → 미공개 수정본에만 저장
    await page.locator(".bn-editor").click();
    await page.keyboard.press("Control+End");
    await page.keyboard.press("Enter");
    await page.keyboard.type("수정한 문장");
    await waitSaved(page);
    await expect(page.getByText("사이트에 아직 반영하지 않은 수정 사항이 있습니다")).toBeVisible();
    post = await readPost(id);
    expect(post.content_text).not.toContain("수정한 문장");
    expect(JSON.stringify(post.draft_content)).toContain("수정한 문장");

    // 변경 사항 공개
    await page.getByRole("button", { name: "변경 사항 공개" }).click();
    await expect(page.getByText("사이트에 아직 반영하지 않은 수정 사항이 있습니다")).toHaveCount(0);
    post = await readPost(id);
    expect(post.content_text).toContain("수정한 문장");
    expect(post.draft_content).toBeNull();

    // 이력: 공개할 때마다 남는다 → 처음 공개본으로 복원(수정본으로 들어감)
    await page.getByRole("button", { name: "이력" }).click();
    const sheet = page.getByRole("dialog", { name: "저장 이력" });
    const restoreButtons = sheet.getByRole("button", { name: "복원" });
    await expect(restoreButtons.first()).toBeVisible();
    expect(await restoreButtons.count()).toBeGreaterThanOrEqual(2);
    page.once("dialog", (d) => d.accept());
    await restoreButtons.last().click();
    await expect(page.getByText("이력을 복원했습니다", { exact: false })).toBeVisible();
    post = await readPost(id);
    expect(JSON.stringify(post.draft_content)).not.toContain("수정한 문장");
    expect(post.content_text).toContain("수정한 문장"); // 공개본은 그대로
  });

  test("저장 전에 다른 페이지로 가면 경고한다", async ({ page }) => {
    await createPost(page, "경고 테스트");
    await page.locator(".bn-editor").click();
    await page.keyboard.type("아직 저장 안 됨");

    let warned = false;
    page.once("dialog", async (dialog) => {
      warned = dialog.message().includes("저장하지 않은 변경 사항");
      await dialog.dismiss();
    });
    await page.getByRole("link", { name: "← 게시물" }).click();
    await expect.poll(() => warned).toBe(true);
    await expect(page).toHaveURL(/\/admin\/posts\/[0-9a-f-]{36}$/);
  });

  test("이미지를 올리면 Storage와 첨부 기록에 저장된다", async ({ page }) => {
    const id = await createPost(page, "이미지 테스트");
    await page.locator(".bn-editor").click();
    await page.keyboard.type("/이미지");
    await page.locator(".bn-suggestion-menu-item").first().click();

    await page
      .locator(".bn-file-panel input[type=file], .bn-editor input[type=file], input[type=file]")
      .first()
      .setInputFiles({
        name: "그림.png",
        mimeType: "image/png",
        buffer: PNG,
      });
    await waitSaved(page);

    const { data: files } = await adminClient()
      .from("attachments")
      .select("file_name, mime_type, size_bytes")
      .eq("post_id", id);
    expect(files).toEqual([
      { file_name: "그림.png", mime_type: "image/png", size_bytes: PNG.length },
    ]);
    const post = await readPost(id);
    expect(JSON.stringify(post.content)).toContain("/storage/v1/object/public/post-files/");
  });

  test("화면이 390px에서 가로로 넘치지 않는다", async ({ page }) => {
    await createPost(page, "모바일 테스트");
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
