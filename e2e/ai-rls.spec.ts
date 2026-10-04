import { expect, test } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import {
  adminClient,
  createMember,
  deleteTestUser,
  hasSupabase,
  randomSuffix,
  userClient,
} from "./helpers/supabase";

type User = { id: string; email: string };

const TEACHER = {
  role: "teacher",
  teacher_status: "approved",
  teacher_school: "테스트학교",
  teacher_position: "교사",
  teacher_subject: "정보",
};
const AI_KEYS = [
  "ai_enabled",
  "ai_monthly_budget_krw",
  "usd_krw_rate",
  "ai_daily_limit_teacher",
  "ai_daily_limit_admin",
];

const aiBlock = (id: string) => ({
  id,
  type: "aiDiscussion",
  props: { level: "중등", count: 3, format: "찬반", keywords: "" },
  children: [],
});
const hash = (n: number) => `${"a".repeat(31)}${n}`;

/*
 * P7-1 AI 생성 예약·완료·대표 공개·보관함(RLS·DB 함수). 실제 Claude API는 부르지 않는다.
 * AI 설정(site_settings)을 잠시 바꾸므로 한 워커에서 차례로 돌고, 끝나면 원래 값으로 되돌린다.
 */
test.describe.serial("RLS: AI 토론 주제 생성 기록", () => {
  test.skip(({ isMobile }) => isMobile || !hasSupabase, "데스크톱 + Supabase 환경에서만");

  const prefix = `e2e-${randomSuffix()}`;
  const users: User[] = [];
  let saved: { key: string; value: unknown }[] = [];
  let admin: User;
  let teacher: User;
  let teacher2: User;
  let student: User;
  let menuId: string;
  let postId: string;
  let plainPostId: string;
  let adminDb: SupabaseClient;
  let teacherDb: SupabaseClient;
  let teacher2Db: SupabaseClient;
  let studentDb: SupabaseClient;
  const db = () => adminClient();

  async function member(overrides: Record<string, unknown> = {}) {
    const user = await createMember(overrides);
    users.push(user);
    return user;
  }
  const setSetting = (key: string, value: unknown) =>
    db().from("site_settings").upsert({ key, value });
  const reserve = (client: SupabaseClient, blockId: string, sourceHash: string, post = postId) =>
    client.rpc("ai_reserve_generation", {
      p_post_id: post,
      p_block_id: blockId,
      p_source_hash: sourceHash,
      p_input: { level: "중등" },
      p_model: "claude-haiku-4-5",
    });
  const status = async (client: SupabaseClient, blockId: string, sourceHash: string) => {
    const { data, error } = await reserve(client, blockId, sourceHash);
    if (error) throw new Error(error.message);
    return data![0] as { status: string; generation_id: string | null; output: unknown };
  };
  const finish = (id: string, values: Record<string, unknown> = {}) =>
    db().rpc("ai_finish_generation", {
      p_id: id,
      p_status: "success",
      p_output: { topics: [{ title: "주제" }] },
      p_input_tokens: 3000,
      p_output_tokens: 1000,
      p_cost_krw: 11.2,
      p_model: "claude-haiku-4-5",
      p_error_code: null,
      ...values,
    });

  test.beforeAll(async ({}, testInfo) => {
    if (testInfo.project.name === "mobile" || !hasSupabase) return;
    const { data } = await db().from("site_settings").select("key, value").in("key", AI_KEYS);
    saved = data ?? [];

    admin = await member({ role: "admin" });
    teacher = await member(TEACHER);
    teacher2 = await member(TEACHER);
    student = await member();

    const { data: menu, error } = await db()
      .from("menus")
      .insert({ slug: prefix, title: "AI 테스트", type: "series" })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    menuId = menu.id;
    const content = [
      { id: "p", type: "paragraph", props: {}, content: [], children: [] },
      ...["ai1", "ai2", "ai3", "ai4", "ai5", "ai6"].map(aiBlock),
    ];
    const insert = async (slug: string, values: Record<string, unknown>) => {
      const { data: post, error: postError } = await db()
        .from("posts")
        .insert({
          menu_id: menuId,
          title: slug,
          slug,
          status: "published",
          content_text: "본문",
          ...values,
        })
        .select("id")
        .single();
      if (postError) throw new Error(postError.message);
      return post.id as string;
    };
    postId = await insert("lesson", { content });
    plainPostId = await insert("plain", { content: [content[0]] });

    adminDb = await userClient(admin.email);
    teacherDb = await userClient(teacher.email);
    teacher2Db = await userClient(teacher2.email);
    studentDb = await userClient(student.email);
    await setSetting("ai_enabled", true);
    await setSetting("ai_monthly_budget_krw", 10000);
    await setSetting("ai_daily_limit_teacher", 20);
  });

  test.afterAll(async () => {
    if (postId) await db().from("ai_generations").delete().in("post_id", [postId, plainPostId]);
    if (menuId) {
      await db().from("posts").delete().eq("menu_id", menuId);
      await db().from("menus").delete().eq("id", menuId);
    }
    for (const row of saved) await setSetting(row.key, row.value);
    for (const u of users) await deleteTestUser(u.id);
  });

  test("학생·비회원은 예약할 수 없고, AI가 꺼져 있으면 disabled", async () => {
    const anon = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false } },
    );
    expect((await reserve(anon, "ai1", hash(1))).error).not.toBeNull();
    expect((await status(studentDb, "ai1", hash(1))).status).toBe("forbidden");

    await setSetting("ai_enabled", false);
    expect((await status(teacherDb, "ai1", hash(1))).status).toBe("disabled");
    await setSetting("ai_enabled", true);
  });

  test("블록이 있는 공개 글만: 없는 블록·블록 없는 글은 no_block", async () => {
    expect((await status(teacherDb, "nope", hash(1))).status).toBe("no_block");
    const { data } = await reserve(teacherDb, "ai1", hash(1), plainPostId);
    expect(data![0].status).toBe("no_block");
  });

  test("예약 → 생성 중 busy → 완료(서버만) → 10분 안 같은 요청은 재사용", async () => {
    const first = await status(teacherDb, "ai1", hash(1));
    expect(first.status).toBe("ok");
    expect((await status(teacherDb, "ai1", hash(2))).status).toBe("busy");

    // 완료 기록은 회원이 직접 부를 수 없다(결과·비용 위조 방지)
    const forged = await teacherDb.rpc("ai_finish_generation", {
      p_id: first.generation_id,
      p_status: "success",
      p_output: {},
      p_input_tokens: 0,
      p_output_tokens: 0,
      p_cost_krw: 0,
      p_model: "x",
      p_error_code: null,
    });
    expect(forged.error).not.toBeNull();
    expect((await finish(first.generation_id!)).error).toBeNull();

    const again = await status(teacherDb, "ai1", hash(1));
    expect(again).toMatchObject({ status: "reused", generation_id: first.generation_id });
    expect(again.output).toEqual({ topics: [{ title: "주제" }] });
    // 다른 교사는 재사용하지 않는다
    expect((await status(teacher2Db, "ai1", hash(1))).status).toBe("ok");
  });

  test("일일 한도·월 예산", async () => {
    const { count } = await db()
      .from("ai_generations")
      .select("id", { count: "exact", head: true })
      .eq("user_id", teacher.id);
    await setSetting("ai_daily_limit_teacher", count);
    expect((await status(teacherDb, "ai2", hash(3))).status).toBe("daily_limit");
    await setSetting("ai_daily_limit_teacher", 20);

    await setSetting("ai_monthly_budget_krw", 0);
    expect((await status(teacherDb, "ai2", hash(3))).status).toBe("budget");
    await setSetting("ai_monthly_budget_krw", 10000);
  });

  test("동시에 여러 번 요청해도 일일 한도를 넘지 않는다", async () => {
    const { count } = await db()
      .from("ai_generations")
      .select("id", { count: "exact", head: true })
      .eq("user_id", teacher.id);
    await setSetting("ai_daily_limit_teacher", (count ?? 0) + 2);
    const results = await Promise.all(
      ["ai2", "ai3", "ai4", "ai5", "ai6"].map((block, i) => status(teacherDb, block, hash(10 + i))),
    );
    const statuses = results.map((r) => r.status).sort();
    expect(statuses).toEqual(["daily_limit", "daily_limit", "daily_limit", "ok", "ok"]);
    await setSetting("ai_daily_limit_teacher", 20);
  });

  test("조회는 본인 것만(관리자는 전체), 보관함 저장은 본인 성공 결과의 is_saved만", async () => {
    const { data: mine } = await teacherDb.from("ai_generations").select("user_id");
    expect(mine!.length).toBeGreaterThan(0);
    expect(mine!.every((r) => r.user_id === teacher.id)).toBe(true);
    const { data: none } = await studentDb.from("ai_generations").select("id");
    expect(none).toEqual([]);
    const { data: all } = await adminDb
      .from("ai_generations")
      .select("user_id")
      .eq("post_id", postId);
    expect(new Set(all!.map((r) => r.user_id))).toEqual(new Set([teacher.id, teacher2.id]));

    const { data: success } = await db()
      .from("ai_generations")
      .select("id")
      .eq("user_id", teacher.id)
      .eq("status", "success")
      .single();
    const { data: savedRow } = await teacherDb
      .from("ai_generations")
      .update({ is_saved: true })
      .eq("id", success!.id)
      .select("is_saved");
    expect(savedRow).toEqual([{ is_saved: true }]);
    // 다른 교사의 결과는 저장할 수 없고, 결과·비용은 바꿀 수 없다
    const { data: others } = await teacher2Db
      .from("ai_generations")
      .update({ is_saved: true })
      .eq("id", success!.id)
      .select("id");
    expect(others ?? []).toEqual([]);
    const tamper = await teacherDb
      .from("ai_generations")
      .update({ cost_krw: 0 })
      .eq("id", success!.id);
    expect(tamper.error).not.toBeNull();
  });

  test("대표 공개: 관리자만, 블록당 1세트로 교체", async () => {
    const { data: rows } = await db()
      .from("ai_generations")
      .select("id, user_id, status")
      .eq("post_id", postId)
      .eq("block_id", "ai1");
    const ok = rows!.find((r) => r.status === "success")!;
    const pending = rows!.find((r) => r.user_id === teacher2.id)!;
    expect((await finish(pending.id)).error).toBeNull();

    expect(
      (await teacherDb.rpc("ai_set_featured", { p_id: ok.id, p_featured: true })).error?.code,
    ).toBe("42501");
    expect(
      (await adminDb.rpc("ai_set_featured", { p_id: ok.id, p_featured: true })).error,
    ).toBeNull();
    expect(
      (await adminDb.rpc("ai_set_featured", { p_id: pending.id, p_featured: true })).error,
    ).toBeNull();
    const { data: featured } = await db()
      .from("ai_generations")
      .select("id")
      .eq("post_id", postId)
      .eq("block_id", "ai1")
      .eq("is_featured", true);
    expect(featured).toEqual([{ id: pending.id }]);
  });
});
