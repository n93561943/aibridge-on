import type { Browser } from "@playwright/test";

import { adminClient, createMember, deleteTestUser, loginAs } from "./supabase";

/**
 * 공개 메뉴 트리는 캐시된다(menus 태그). DB에 직접 넣으면 사이트에 바로 보이지 않으므로,
 * 공개 화면을 검사하는 테스트는 실제 관리자처럼 관리자 화면으로 메뉴를 만들고 지운다(캐시 재검증).
 */
export async function withAdminPage<T>(
  browser: Browser,
  baseURL: string,
  run: (page: import("@playwright/test").Page) => Promise<T>,
) {
  const admin = await createMember({ role: "admin" });
  const context = await browser.newContext({ baseURL });
  try {
    await loginAs(context, admin.email, baseURL);
    return await run(await context.newPage());
  } finally {
    await context.close();
    await deleteTestUser(admin.id);
  }
}

export async function createMenuViaAdmin(
  browser: Browser,
  baseURL: string,
  menu: { slug: string; title: string; type?: "series" | "board" },
): Promise<string> {
  await withAdminPage(browser, baseURL, async (page) => {
    await page.goto("/admin/menus");
    await page.getByRole("button", { name: "메뉴 추가", exact: true }).click();
    const sheet = page.getByRole("dialog");
    if (menu.type === "board") await sheet.getByLabel("유형").selectOption("board");
    await sheet.getByLabel("제목").fill(menu.title);
    await sheet.getByLabel("주소(slug)").fill(menu.slug);
    await sheet.getByRole("button", { name: "메뉴 추가" }).click();
    await page.getByRole("status").filter({ hasText: "메뉴를 만들었습니다" }).waitFor();
  });
  const { data } = await adminClient().from("menus").select("id").eq("slug", menu.slug).single();
  return data!.id;
}

/** 메뉴와 그 게시물을 지운다. 게시물은 DB에서 바로 지우고, 메뉴는 관리자 화면으로 지워 캐시를 갱신한다. */
export async function deleteMenuViaAdmin(
  browser: Browser,
  baseURL: string,
  menu: { id: string; title: string },
) {
  await adminClient().from("posts").delete().eq("menu_id", menu.id);
  await withAdminPage(browser, baseURL, async (page) => {
    await page.goto("/admin/menus");
    await page.getByRole("button", { name: `삭제: ${menu.title}`, exact: true }).click();
    await page.getByRole("button", { name: "삭제", exact: true }).click();
    await page.getByRole("status").filter({ hasText: "삭제했습니다" }).waitFor();
  });
}
