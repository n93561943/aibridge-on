import { expect, test } from "@playwright/test";

import {
  adminClient,
  createMember,
  deleteTestUser,
  hasSupabase,
  loginAs,
  randomSuffix,
} from "./helpers/supabase";
import { createMenuViaAdmin, deleteMenuViaAdmin } from "./helpers/menus";

const t = (s: string) => [{ type: "text", text: s, styles: {} }];
const SECRET = "정답은사십이";

/** 공개 화면 확인용: 활성 메뉴(잠깐 헤더에 보임) + 공개 2개·초안 1개 */
test.describe("수업 자료 열람(F-07)", () => {
  test.skip(!hasSupabase, "Supabase 환경변수가 필요합니다");

  const slug = `e2e-${randomSuffix()}`;
  const title = `읽기${slug.slice(-4)}`;
  let menuId: string;
  const users: string[] = [];

  test.beforeAll(async ({ browser, baseURL }) => {
    const db = adminClient();
    menuId = await createMenuViaAdmin(browser, baseURL!, { slug, title });
    const content = [
      { id: "h", type: "heading", props: { level: 1 }, content: t("학습 목표"), children: [] },
      { id: "p", type: "paragraph", props: {}, content: t("반복문을 이해한다."), children: [] },
      {
        id: "tb",
        type: "teacherBox",
        props: {},
        content: t("평가 기준"),
        children: [{ id: "s", type: "paragraph", props: {}, content: t(SECRET), children: [] }],
      },
      {
        id: "c",
        type: "codeBlock",
        props: { language: "python" },
        content: t("for i in range(3):\n    print(i)"),
        children: [],
      },
    ];
    const { error: postError } = await db.from("posts").insert([
      {
        menu_id: menuId,
        title: "반복문",
        slug: "loop",
        lesson_no: 1,
        sort_order: 1,
        status: "published",
        content,
        content_text: "학습 목표\n반복문을 이해한다.",
        summary: "for 문",
      },
      {
        menu_id: menuId,
        title: "조건문",
        slug: "if",
        lesson_no: 2,
        sort_order: 2,
        status: "published",
        content: [],
        content_text: "",
      },
      {
        menu_id: menuId,
        title: "비공개 초안",
        slug: "secret-draft",
        lesson_no: 3,
        sort_order: 3,
        status: "draft",
        content: [],
        content_text: "",
      },
    ]);
    if (postError) throw new Error(postError.message);
  });

  test.afterAll(async ({ browser, baseURL }) => {
    if (menuId) await deleteMenuViaAdmin(browser, baseURL!, { id: menuId, title });
    for (const id of users) await deleteTestUser(id);
  });

  test("비회원: 차시 목록에는 공개 글만, 상세에는 교사 전용 내용이 없다", async ({
    page,
    isMobile,
  }) => {
    await page.goto(`/${slug}`);
    const list = page.getByRole("list", { name: "차시 목록" });
    await expect(list.getByRole("link")).toHaveCount(2);
    await expect(list).not.toContainText("비공개 초안");

    await list.getByRole("link", { name: /반복문/ }).click();
    await expect(page).toHaveURL(new RegExp(`/${slug}/loop$`));
    await expect(page.getByRole("heading", { level: 1, name: "반복문" })).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: "학습 목표" })).toBeVisible();
    await expect(page.getByText("1차시", { exact: true })).toBeVisible();

    // 교사 전용 내용은 화면은 물론 HTML에도 없어야 한다(서버가 뺌)
    expect(await page.content()).not.toContain(SECRET);
    await expect(page.getByRole("region", { name: "교사 전용" })).toHaveCount(0);

    // 코드 복사 버튼, 다음 차시
    await expect(page.getByRole("button", { name: "코드 복사" })).toBeVisible();
    await page.getByRole("link", { name: /다음 차시/ }).click();
    await expect(page).toHaveURL(new RegExp(`/${slug}/if$`));
    await expect(page.getByRole("link", { name: /이전 차시/ })).toBeVisible();

    // 목차: 데스크톱은 왼쪽, 모바일은 접힌 목차
    const toc = page.getByRole("navigation", { name: /차시 목차/ });
    if (isMobile) {
      await page.getByText("차시 목차 (2)").click();
      await expect(toc.getByRole("link", { name: /반복문/ })).toBeVisible();
    } else {
      await expect(toc.first().getByRole("link", { name: /조건문/ })).toHaveAttribute(
        "aria-current",
        "page",
      );
    }

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test("초안 주소는 비회원에게 404", async ({ page }) => {
    const res = await page.goto(`/${slug}/secret-draft`);
    expect(res?.status()).toBe(404);
  });

  test("승인된 교사는 교사 전용 박스를 본다", async ({ page, context, baseURL }) => {
    const teacher = await createMember({
      role: "teacher",
      teacher_status: "approved",
      teacher_school: "테스트학교",
      teacher_position: "교사",
      teacher_subject: "정보",
    });
    users.push(teacher.id);
    await loginAs(context, teacher.email, baseURL!);
    await page.goto(`/${slug}/loop`);
    await expect(page.getByRole("region", { name: "교사 전용" })).toContainText(SECRET);
  });

  test("관리자는 초안을 미리보기 표시와 함께 본다", async ({ page, context, baseURL }) => {
    const admin = await createMember({ role: "admin" });
    users.push(admin.id);
    await loginAs(context, admin.email, baseURL!);
    await page.goto(`/${slug}/secret-draft`);
    await expect(page.getByRole("note")).toContainText("관리자 미리보기");
    await expect(page.getByRole("link", { name: "편집" })).toBeVisible();
  });

  test("인쇄할 때 헤더·목차·이전/다음을 숨긴다", async ({ page, isMobile }) => {
    test.skip(isMobile, "데스크톱에서만");
    await page.goto(`/${slug}/loop`);
    await page.emulateMedia({ media: "print" });
    await expect(page.getByRole("banner")).toBeHidden();
    await expect(page.getByRole("navigation", { name: "이전·다음 차시" })).toBeHidden();
    await expect(page.getByRole("heading", { level: 1, name: "반복문" })).toBeVisible();
  });
});
