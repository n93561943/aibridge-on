import { expect, type Locator, type Page, test } from "@playwright/test";

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
const STORAGE = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/post-files/`;
const MIN = 60 * 1000;
const ago = (ms: number) => new Date(Date.now() - ms).toISOString();

/** 게시판 글 상세·댓글 트리(F-08, P5-4) */
test.describe("게시판 글 상세", () => {
  test.skip(!hasSupabase, "Supabase 환경변수가 필요합니다");
  // 준비(관리자 화면 로그인)가 무거워 워커마다 반복되지 않게 한 워커에서 차례로 돈다.
  test.describe.configure({ mode: "default" });

  const slug = `e2e-${randomSuffix()}`;
  const title = `상세${slug.slice(-4)}`;
  let menuId: string;
  let author: { id: string; email: string };
  let authorName: string;
  let postId: string;
  const ids: Record<string, string> = {};
  const users: string[] = [];

  const db = () => adminClient();
  const formOf = (field: Locator) => field.locator("xpath=ancestor::form[1]");
  const comments = (page: Page) => page.getByRole("list", { name: "댓글 목록" });
  const comment = (page: Page, name: string) =>
    page.getByRole("listitem", { name, exact: true }).first();

  async function member(overrides: Record<string, unknown> = {}) {
    const user = await createMember(overrides);
    users.push(user.id);
    return user;
  }

  async function seedComment(key: string, values: Record<string, unknown>) {
    const { data, error } = await db()
      .from("comments")
      .insert({ post_id: postId, author_id: author.id, ...values })
      .select("id")
      .single();
    if (error) throw new Error(`${key}: ${error.message}`);
    ids[key] = data.id;
    return data.id as string;
  }

  test.beforeAll(async ({ browser, baseURL }) => {
    menuId = await createMenuViaAdmin(browser, baseURL!, { slug, title, type: "board" });
    await db().from("menus").update({ board_write_role: "student" }).eq("id", menuId);

    authorName = `작성${randomSuffix()}`.slice(0, 12);
    author = await member({ nickname: authorName });
    const { data, error } = await db()
      .from("posts")
      .insert({
        menu_id: menuId,
        title: "상세 글",
        slug: "detail",
        status: "published",
        author_id: author.id,
        created_at: ago(30 * MIN),
        content: [
          { id: "p", type: "paragraph", props: {}, content: t("상세 본문입니다"), children: [] },
          {
            id: "i1",
            type: "image",
            props: { url: `${STORAGE}board/${author.id}/mine.png`, caption: "내 사진" },
            children: [],
          },
          {
            id: "i2",
            type: "image",
            props: { url: "https://example.com/track.png", caption: "외부 사진" },
            children: [],
          },
        ],
        content_text: "상세 본문입니다",
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    postId = data.id;

    // 댓글: 인기(점수 5) + 답글, 최신(점수 1), 삭제(답글 있음/없음), 숨김(답글 없음)
    await seedComment("popular", { body: "인기 댓글 **굵게**", created_at: ago(20 * MIN) });
    await db().from("comments").update({ score: 5 }).eq("id", ids.popular);
    await seedComment("reply", {
      parent_id: ids.popular,
      body: "인기 댓글의 답글",
      created_at: ago(19 * MIN),
    });
    await seedComment("recent", {
      body: "최신 댓글 https://example.com",
      created_at: ago(5 * MIN),
    });
    await db().from("comments").update({ score: 1 }).eq("id", ids.recent);
    await seedComment("deleted", { body: "지울 댓글", created_at: ago(15 * MIN) });
    await seedComment("orphan", {
      parent_id: ids.deleted,
      body: "삭제된 댓글의 답글",
      created_at: ago(14 * MIN),
    });
    await db()
      .from("comments")
      .update({ deleted_at: ago(1 * MIN) })
      .eq("id", ids.deleted);
    await seedComment("gone", { body: "흔적 없이 지울 댓글", created_at: ago(13 * MIN) });
    await db()
      .from("comments")
      .update({ deleted_at: ago(1 * MIN) })
      .eq("id", ids.gone);
    await seedComment("hidden", { body: "숨긴 댓글 본문", created_at: ago(12 * MIN) });
    await db()
      .from("comments")
      .update({ hidden_at: ago(1 * MIN) })
      .eq("id", ids.hidden);
    // 5단계(depth 4) 답글 사슬
    let parent = ids.recent;
    for (let depth = 1; depth <= 4; depth++) {
      parent = await seedComment(`d${depth}`, {
        parent_id: parent,
        body: `${depth}단계 답글`,
        created_at: ago((5 - depth) * MIN),
      });
    }
  });

  test.afterAll(async ({ browser, baseURL }) => {
    if (menuId) await deleteMenuViaAdmin(browser, baseURL!, { id: menuId, title });
    for (const id of users) await deleteTestUser(id);
  });

  test("비회원: 본문(외부 이미지 차단)·댓글 트리·삭제 자리·정렬·접기", async ({ page }) => {
    await page.goto(`/${slug}/detail`);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("상세 글");
    const article = page.getByRole("article", { name: "상세 글" });
    await expect(article).toContainText(authorName);
    await expect(article).toContainText("30분 전");
    await expect(article.locator("figure img")).toHaveCount(1);
    await expect(article.getByRole("img", { name: "내 사진" })).toBeVisible();
    // 보이는 댓글 8개(삭제 2·숨김 1 제외)
    await expect(page.getByRole("heading", { name: "댓글 8" })).toBeVisible();

    // 서식: 굵게·자동 링크
    await expect(comment(page, authorName).getByText("굵게")).toBeVisible();
    await expect(page.getByRole("link", { name: "https://example.com" })).toHaveAttribute(
      "target",
      "_blank",
    );

    // 삭제된 댓글은 답글이 있을 때만 자리, 숨긴 댓글 본문은 HTML에도 없다
    await expect(page.getByText("삭제된 댓글입니다.")).toHaveCount(1);
    await expect(page.getByText("삭제된 댓글의 답글")).toBeVisible();
    await expect(page.getByText("흔적 없이 지울 댓글")).toHaveCount(0);
    expect(await page.content()).not.toContain("숨긴 댓글 본문");
    expect(await page.content()).not.toContain("지울 댓글</");

    // 추천순(기본): 인기 → 최신 → 삭제 자리
    const topLevel = comments(page).locator(":scope > li");
    await expect(topLevel.first()).toContainText("인기 댓글");
    await page.getByRole("button", { name: "최신순" }).click();
    await expect(topLevel.first()).toContainText("최신 댓글");

    // 접기
    const popular = topLevel.filter({ hasText: "인기 댓글" });
    await popular.getByRole("button", { name: "접기" }).first().click();
    await expect(page.getByText("인기 댓글의 답글")).toHaveCount(0);
    // 접으면 본문이 사라지므로 펼치기 버튼(접힌 댓글은 하나뿐)으로 찾는다
    await comments(page).getByRole("button", { name: "펼치기" }).click();
    await expect(page.getByText("인기 댓글의 답글")).toBeVisible();

    // 비회원: 댓글 입력 대신 로그인 안내, 투표하면 안내
    await expect(page.getByRole("textbox", { name: "댓글 쓰기" })).toHaveCount(0);
    await expect(page.getByText("댓글을 쓰려면")).toBeVisible();
    await page
      .getByRole("article", { name: "상세 글" })
      .getByRole("button", { name: "추천", exact: true })
      .click();
    await expect(page.getByText("투표하려면 로그인해 주세요.")).toBeVisible();
  });

  test("회원: 답글·10초 제한·수정·삭제, 5단계에는 답글 버튼이 없다, 댓글 투표", async ({
    page,
    baseURL,
    isMobile,
  }) => {
    test.skip(isMobile, "데스크톱에서만");
    const nick = `회원${randomSuffix()}`.slice(0, 12);
    const user = await member({ nickname: nick });
    await loginAs(page.context(), user.email, baseURL!);
    await page.goto(`/${slug}/detail`);

    // 5단계 답글에는 답글 버튼이 없다
    const deepest = page.getByRole("listitem").filter({ hasText: "4단계 답글" }).last();
    await expect(deepest.getByRole("button", { name: "답글" })).toHaveCount(0);
    const third = page.getByRole("listitem").filter({ hasText: "3단계 답글" }).last();
    await expect(third.getByRole("button", { name: "답글", exact: true }).first()).toBeVisible();

    // 답글 달기
    const popular = comments(page).locator(":scope > li").filter({ hasText: "인기 댓글" });
    await popular.getByRole("button", { name: "답글", exact: true }).first().click();
    const replyBox = page.getByRole("textbox", { name: `${authorName}님에게 답글` });
    await replyBox.fill("내 답글 `code`");
    await formOf(replyBox).getByRole("button", { name: "답글", exact: true }).click();
    const mine = comment(page, nick);
    await expect(mine).toContainText("내 답글");
    await expect(mine.locator("code")).toHaveText("code");

    // 10초 안에 또 쓰면 막힌다
    await page.getByRole("textbox", { name: "댓글 쓰기" }).fill("바로 또 쓰기");
    await page.getByRole("button", { name: "댓글", exact: true }).click();
    await expect(page.getByText("댓글은 10초에 1개만")).toBeVisible();

    // 수정 → 수정됨
    await mine.getByRole("button", { name: "수정" }).click();
    const editBox = page.getByRole("textbox", { name: "댓글 수정" });
    await editBox.fill("고친 답글");
    await formOf(editBox).getByRole("button", { name: "수정", exact: true }).click();
    await expect(comment(page, nick)).toContainText("고친 답글");
    await expect(comment(page, nick)).toContainText("수정됨");

    // 댓글 투표
    const recent = comments(page).locator(":scope > li").filter({ hasText: "최신 댓글" });
    const up = recent.getByRole("button", { name: "추천", exact: true }).first();
    await up.click();
    await expect(up).toHaveAttribute("aria-pressed", "true");
    await expect(recent.getByTestId("score").first()).toHaveText("점수 2");

    // 삭제(답글 없음 → 사라짐)
    page.once("dialog", (d) => d.accept());
    await comment(page, nick).getByRole("button", { name: "삭제" }).click();
    await expect(page.getByText("고친 답글")).toHaveCount(0);
    const { data } = await db()
      .from("comments")
      .select("deleted_at, body")
      .eq("author_id", user.id);
    expect(data).toHaveLength(1);
    expect(data![0].body).toBe("");
    expect(data![0].deleted_at).not.toBeNull();
    await db().from("votes").delete().eq("user_id", user.id);
  });

  test("관리자: 고정·해제, 남의 댓글 삭제", async ({ page, baseURL, isMobile }) => {
    test.skip(isMobile, "데스크톱에서만");
    const admin = await member({ role: "admin" });
    await loginAs(page.context(), admin.email, baseURL!);
    await page.goto(`/${slug}/detail`);
    const article = page.getByRole("article", { name: "상세 글" });
    await expect(article.getByRole("link", { name: "수정" })).toHaveCount(0);

    await article.getByRole("button", { name: "고정", exact: true }).click();
    await expect(article.getByText("공지", { exact: true })).toBeVisible();
    await expect(article.getByRole("button", { name: "고정 해제" })).toBeVisible();
    await article.getByRole("button", { name: "고정 해제" }).click();
    await expect(article.getByText("공지", { exact: true })).toHaveCount(0);

    page.once("dialog", (d) => d.accept());
    const target = comments(page).locator(":scope > li").filter({ hasText: "최신 댓글" });
    await target.getByRole("button", { name: "삭제" }).first().click();
    // 답글이 있어 자리만 남는다
    await expect(page.getByText("삭제된 댓글입니다.")).toHaveCount(2);
    await expect(page.getByText("최신 댓글 https://example.com")).toHaveCount(0);
  });

  test("작성자: 수정 화면으로 가고, 삭제하면 휴지통으로", async ({ page, baseURL, isMobile }) => {
    test.skip(isMobile, "데스크톱에서만");
    // 다른 테스트에 영향이 없게 따로 글을 만든다
    await db().from("posts").insert({
      menu_id: menuId,
      title: "지울 글",
      slug: "to-trash",
      status: "published",
      author_id: author.id,
      content: [],
      content_text: "",
    });
    await loginAs(page.context(), author.email, baseURL!);
    await page.goto(`/${slug}/to-trash`);
    const article = page.getByRole("article", { name: "지울 글" });
    await expect(article.getByRole("link", { name: "수정" })).toHaveAttribute(
      "href",
      `/${slug}/to-trash/edit`,
    );
    await expect(article.getByRole("button", { name: "고정" })).toHaveCount(0);

    page.once("dialog", (d) => d.accept());
    await article.getByRole("button", { name: "삭제" }).click();
    await expect(page).toHaveURL(new RegExp(`/${slug}$`));
    const { data } = await db().from("posts").select("deleted_at").eq("slug", "to-trash").single();
    expect(data?.deleted_at).not.toBeNull();
    const res = await page.goto(`/${slug}/to-trash`);
    expect(res?.status()).toBe(404);
  });

  test("390px에서 깊은 댓글도 가로로 넘치지 않는다", async ({ page, isMobile }) => {
    test.skip(!isMobile, "모바일 전용");
    await page.goto(`/${slug}/detail`);
    await expect(page.getByText("4단계 답글")).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
