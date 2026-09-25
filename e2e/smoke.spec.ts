import { expect, test } from "@playwright/test";

test("홈 화면이 열리고 헤더·푸터가 보인다", async ({ page }) => {
  const response = await page.goto("/");
  expect(response?.status()).toBe(200);
  await expect(page.getByRole("link", { name: "AI Bridge:ON 홈" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("AI Bridge");
  await expect(page.getByRole("contentinfo")).toBeVisible();
});

test("가로 스크롤이 생기지 않는다", async ({ page }) => {
  await page.goto("/");
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});

test("모바일에서 햄버거 메뉴가 열린다", async ({ page, isMobile }) => {
  test.skip(!isMobile, "모바일 전용");
  await page.goto("/");
  await page.getByRole("button", { name: "메뉴 열기" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
});

test("헬스체크가 응답한다", async ({ request }) => {
  const res = await request.get("/api/health");
  const body = await res.json();
  expect(body.app).toBe("ok");
  expect(["ok", "not_configured"]).toContain(body.supabase);
});
