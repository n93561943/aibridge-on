import { expect, test } from "@playwright/test";

import { createMenuViaAdmin, deleteMenuViaAdmin } from "./helpers/menus";
import { adminClient, hasSupabase, randomSuffix } from "./helpers/supabase";

test.describe("검색(F-10)", () => {
  test.skip(!hasSupabase, "Supabase 환경변수가 필요합니다");

  const tag = randomSuffix();
  // 다른 글과 겹치지 않는 검색어
  const WORD = `별빛${tag}`;
  const slug = `e2e-${tag}`;
  const title = `검색${tag}`;
  let menuId: string;

  test.beforeAll(async ({ browser, baseURL }) => {
    menuId = await createMenuViaAdmin(browser, baseURL!, { slug, title });
    const { error } = await adminClient()
      .from("posts")
      .insert([
        {
          menu_id: menuId,
          title: `${WORD} 관찰하기`,
          slug: "a",
          sort_order: 1,
          lesson_no: 1,
          status: "published",
          content: [],
          content_text: "밤하늘을 본다.",
        },
        {
          menu_id: menuId,
          title: "관측 기록",
          slug: "b",
          sort_order: 2,
          status: "published",
          content: [],
          content_text: `오늘은 ${WORD}을 기록했다. 망원경을 썼다.`,
        },
        {
          menu_id: menuId,
          title: `${WORD} 초안`,
          slug: "c",
          sort_order: 3,
          status: "draft",
          content: [],
          content_text: "",
        },
      ]);
    if (error) throw new Error(error.message);
  });

  test.afterAll(async ({ browser, baseURL }) => {
    if (menuId) await deleteMenuViaAdmin(browser, baseURL!, { id: menuId, title });
  });

  test("제목·본문에서 찾고 검색어를 강조한다(초안은 제외)", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "검색", exact: true }).click();
    await page.getByRole("searchbox", { name: "검색어" }).fill(WORD);
    await page.getByRole("button", { name: "검색", exact: true }).click();

    const results = page.getByRole("list", { name: "검색 결과" }).getByRole("link");
    await expect(results).toHaveCount(2);
    // 제목 일치가 먼저
    await expect(results.first()).toContainText(`${WORD} 관찰하기`);
    await expect(results.nth(1)).toContainText("관측 기록");
    await expect(results.nth(1).locator("mark")).toHaveText(WORD);
    await expect(page.getByText(`${WORD} 초안`)).toHaveCount(0);

    await results.first().click();
    await expect(page).toHaveURL(new RegExp(`/${slug}/a$`));
  });

  test("메뉴 필터·짧은 검색어·결과 없음", async ({ page }) => {
    await page.goto(`/search?q=${encodeURIComponent(WORD)}&menu=${menuId}`);
    await expect(page.getByRole("list", { name: "검색 결과" }).getByRole("link")).toHaveCount(2);

    await page.goto("/search?q=a");
    await expect(page.getByText("2글자 이상 입력해 주세요")).toBeVisible();

    await page.goto(`/search?q=${encodeURIComponent(`없는낱말${tag}`)}`);
    await expect(page.getByText("찾는 자료가 없습니다")).toBeVisible();

    // %·_는 글자 그대로 찾는다(모든 글이 나오면 안 됨)
    await page.goto("/search?q=%25%25");
    await expect(page.getByText("찾는 자료가 없습니다")).toBeVisible();

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
