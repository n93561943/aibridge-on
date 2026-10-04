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

const t = (text: string) => [{ type: "text", text, styles: {} }];

/** 신고·관리자 처리(/admin/reports)·/me 내 글·댓글(F-08, P5-5) */
test.describe("신고와 내 활동", () => {
  test.skip(!hasSupabase, "Supabase 환경변수가 필요합니다");
  // 신고 → 처리 → 확인 순서가 있어 한 워커에서 차례로 돈다.
  test.describe.configure({ mode: "default" });

  const slug = `e2e-${randomSuffix()}`;
  const title = `제보${slug.slice(-4)}`;
  let menuId: string;
  let author: { id: string; email: string };
  let reporter: { id: string; email: string };
  let reporterName: string;
  const ids: Record<string, string> = {};
  const users: string[] = [];
  const db = () => adminClient();

  async function member(overrides: Record<string, unknown> = {}) {
    const user = await createMember(overrides);
    users.push(user.id);
    return user;
  }

  async function insertPost(key: string, values: Record<string, unknown>) {
    const { data, error } = await db()
      .from("posts")
      .insert({
        menu_id: menuId,
        slug: key,
        status: "published",
        author_id: author.id,
        content: [{ id: "p", type: "paragraph", props: {}, content: t("본문"), children: [] }],
        content_text: "본문",
        ...values,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    ids[key] = data.id;
  }

  async function report(page: Page, reason: string, detail?: string) {
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await dialog.getByRole("radio", { name: reason }).check();
    if (detail) await dialog.getByLabel("자세한 내용(선택)").fill(detail);
    await dialog.getByRole("button", { name: "신고하기" }).click();
  }

  test.beforeAll(async ({ browser, baseURL }) => {
    menuId = await createMenuViaAdmin(browser, baseURL!, { slug, title, type: "board" });
    await db().from("menus").update({ board_write_role: "student" }).eq("id", menuId);
    author = await member({ nickname: `작성${randomSuffix()}`.slice(0, 12) });
    reporterName = `신고${randomSuffix()}`.slice(0, 12);
    reporter = await member({ nickname: reporterName });

    await insertPost("bad-post", { title: "숨길 글" });
    await insertPost("with-comment", { title: "댓글 달린 글" });
    await insertPost("keep-post", { title: "유지할 글" });
    await insertPost("trashed", { title: "휴지통 글", deleted_at: new Date().toISOString() });
    const { data: comment } = await db()
      .from("comments")
      .insert({ post_id: ids["with-comment"], author_id: author.id, body: "숨길 댓글입니다" })
      .select("id")
      .single();
    ids.comment = comment!.id;
    await db()
      .from("comments")
      .insert({ post_id: ids["with-comment"], author_id: reporter.id, body: "신고자의 댓글" });
  });

  test.afterAll(async ({ browser, baseURL }) => {
    // 게시물을 지우면 그 글·댓글의 신고·투표도 트리거가 지운다.
    if (menuId) await deleteMenuViaAdmin(browser, baseURL!, { id: menuId, title });
    for (const id of users) await deleteTestUser(id);
  });

  test("비회원은 신고 대신 로그인 안내", async ({ page }) => {
    await page.goto(`/${slug}/bad-post`);
    await page.getByRole("button", { name: "신고", exact: true }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.getByText("신고하려면 로그인해 주세요.")).toBeVisible();
  });

  test("회원: 글·댓글 신고, 같은 대상은 한 번만, 내 댓글엔 신고 버튼 없음", async ({
    page,
    baseURL,
    isMobile,
  }) => {
    test.skip(isMobile, "데스크톱에서만");
    await loginAs(page.context(), reporter.email, baseURL!);

    await page.goto(`/${slug}/bad-post`);
    await page.getByRole("button", { name: "신고", exact: true }).click();
    await report(page, "욕설·비방", "심한 말이 있어요");
    await expect(page.getByText("신고했습니다. 관리자가 확인한 뒤 처리합니다.")).toBeVisible();
    await page.getByRole("button", { name: "신고", exact: true }).click();
    await report(page, "스팸·광고");
    await expect(page.getByRole("dialog").getByRole("alert")).toHaveText(/이미 신고했습니다/);
    await page.keyboard.press("Escape");

    await page.goto(`/${slug}/with-comment`);
    const list = page.getByRole("list", { name: "댓글 목록" });
    const mine = list.getByRole("listitem", { name: reporterName });
    await expect(mine.getByRole("button", { name: "신고", exact: true })).toHaveCount(0);
    const target = list.getByRole("listitem").filter({ hasText: "숨길 댓글입니다" });
    await target.getByRole("button", { name: "신고", exact: true }).click();
    await report(page, "스팸·광고");
    await expect(page.getByText("신고했습니다.", { exact: false })).toBeVisible();

    await page.goto(`/${slug}/keep-post`);
    await page.getByRole("button", { name: "신고", exact: true }).click();
    await report(page, "기타");
    await expect(page.getByText("신고했습니다.", { exact: false })).toBeVisible();

    // 관리자 화면은 못 들어간다
    await page.goto("/admin/reports");
    await expect(page).not.toHaveURL(/\/admin\/reports/);
  });

  test("관리자: 대상별 신고를 보고 숨김·유지 처리", async ({ page, baseURL, isMobile }) => {
    test.skip(isMobile, "데스크톱에서만");
    const admin = await member({ role: "admin" });
    await loginAs(page.context(), admin.email, baseURL!);
    await page.goto("/admin/reports");
    await expect(
      page.getByRole("navigation", { name: "관리자 메뉴" }).getByRole("link", { name: /신고/ }),
    ).toContainText(/\d/);

    const open = page.getByRole("list", { name: "처리 대기 신고" });
    const badPost = open.locator(":scope > li").filter({ hasText: "숨길 글" });
    await expect(badPost).toContainText("신고 1건");
    await expect(badPost).toContainText("욕설·비방 1");
    await badPost.getByText("신고 내용 보기").click();
    await expect(badPost).toContainText(reporterName);
    await expect(badPost).toContainText("심한 말이 있어요");

    page.on("dialog", (d) => d.accept());
    await badPost.getByRole("button", { name: /^숨김:/ }).click();
    await expect(open.locator(":scope > li").filter({ hasText: "숨길 글" })).toHaveCount(0);

    const badComment = open.locator(":scope > li").filter({ hasText: "숨길 댓글입니다" });
    await badComment.getByRole("button", { name: /^숨김:/ }).click();
    await expect(open.locator(":scope > li").filter({ hasText: "숨길 댓글입니다" })).toHaveCount(0);

    const keep = open.locator(":scope > li").filter({ hasText: "유지할 글" });
    await keep.getByRole("button", { name: /^유지:/ }).click();
    await expect(open.locator(":scope > li").filter({ hasText: "유지할 글" })).toHaveCount(0);

    // 공개 화면 반영: 숨긴 글은 404, 숨긴 댓글은 사라짐, 유지한 글은 그대로
    expect((await page.goto(`/${slug}/bad-post`))?.status()).toBe(404);
    await page.goto(`/${slug}/with-comment`);
    await expect(page.getByText("숨길 댓글입니다")).toHaveCount(0);
    expect((await page.goto(`/${slug}/keep-post`))?.status()).toBe(200);

    const { data: reports } = await db()
      .from("reports")
      .select("status, resolution")
      .in("target_id", [ids["bad-post"], ids.comment, ids["keep-post"]]);
    expect(reports).toHaveLength(3);
    expect(reports!.every((r) => r.status === "resolved")).toBe(true);
  });

  test("작성자: /me에서 숨김·휴지통 상태를 본다", async ({ page, baseURL, isMobile }) => {
    test.skip(isMobile, "데스크톱에서만");
    await loginAs(page.context(), author.email, baseURL!);
    await page.goto("/me");
    const posts = page.getByRole("list", { name: "내 글 목록" });
    await expect(posts.getByRole("listitem")).toHaveCount(4);
    await expect(posts.getByRole("listitem").filter({ hasText: "숨길 글" })).toContainText(
      "관리자가 숨김",
    );
    await expect(posts.getByRole("listitem").filter({ hasText: "휴지통 글" })).toContainText(
      "휴지통",
    );
    await expect(posts.getByRole("link", { name: "유지할 글" })).toHaveAttribute(
      "href",
      `/${slug}/keep-post`,
    );
    const myComments = page.getByRole("list", { name: "내 댓글 목록" });
    await expect(myComments.getByRole("listitem")).toHaveCount(1);
    await expect(myComments).toContainText("관리자가 숨김");
    await expect(myComments.getByRole("link", { name: "댓글 달린 글" })).toHaveAttribute(
      "href",
      `/${slug}/with-comment#comments`,
    );
  });

  test("관리자: 처리 완료에서 숨김 해제하면 다시 보인다", async ({ page, baseURL, isMobile }) => {
    test.skip(isMobile, "데스크톱에서만");
    const admin = await member({ role: "admin" });
    await loginAs(page.context(), admin.email, baseURL!);
    await page.goto("/admin/reports?tab=resolved");
    const done = page.getByRole("list", { name: "처리 완료 신고" });
    const item = done.locator(":scope > li").filter({ hasText: "숨길 글" });
    await expect(item).toContainText("숨김");
    await expect(done.locator(":scope > li").filter({ hasText: "유지할 글" })).toContainText(
      "유지",
    );
    await item.getByRole("button", { name: /^숨김 해제:/ }).click();
    // 숨김이 풀리면 버튼이 사라진다
    await expect(item.getByRole("button", { name: /^숨김 해제:/ })).toHaveCount(0);
    expect((await page.goto(`/${slug}/bad-post`))?.status()).toBe(200);
  });

  test("390px에서 신고 창과 /me가 넘치지 않는다", async ({ page, baseURL, isMobile }) => {
    test.skip(!isMobile, "모바일 전용");
    const user = await member();
    await loginAs(page.context(), user.email, baseURL!);
    await page.goto(`/${slug}/keep-post`);
    await page.getByRole("button", { name: "신고", exact: true }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    const overflow = () =>
      page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
    expect(await overflow()).toBeLessThanOrEqual(0);
    await page.keyboard.press("Escape");
    await page.goto("/me");
    await expect(page.getByRole("heading", { name: "내 글" })).toBeVisible();
    expect(await overflow()).toBeLessThanOrEqual(0);
  });
});
