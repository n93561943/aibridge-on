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

/*
 * P5 게시판 DB 권한(RLS·트리거·RPC). 도배 방지(글 1분·댓글 10초) 때문에
 * 시나리오마다 다른 회원을 쓰고, 순서가 있는 검사는 serial로 묶는다.
 */
test.describe.serial("RLS: 게시판(posts·comments·votes·reports)", () => {
  test.skip(({ isMobile }) => isMobile || !hasSupabase, "데스크톱 + Supabase 환경에서만");

  const prefix = `e2e-${randomSuffix()}`;
  const users: User[] = [];
  let admin: User;
  let writer: User; // 학생 게시판 글쓴이
  let commenter: User;
  let voter: User;
  let pending: User; // 보호자 동의 대기
  let teacher: User;

  let studentBoardId: string; // 글쓰기 student
  let teacherBoardId: string; // 글쓰기 teacher
  let lockedBoardId: string; // 댓글·추천 꺼짐
  let seriesMenuId: string;
  let noticeId: string; // 관리자가 쓴 학생 게시판 글
  let lockedPostId: string;

  const db = () => adminClient();
  const anon = () =>
    createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        auth: { persistSession: false },
      },
    );

  async function member(overrides: Record<string, unknown> = {}) {
    const user = await createMember(overrides);
    users.push(user);
    return user;
  }

  async function insertMenu(slug: string, values: Record<string, unknown>) {
    const { data, error } = await db()
      .from("menus")
      .insert({ slug: `${prefix}-${slug}`, title: `테스트 ${slug}`, ...values })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return data.id as string;
  }

  async function insertPost(menuId: string, values: Record<string, unknown> = {}) {
    const { data, error } = await db()
      .from("posts")
      .insert({
        menu_id: menuId,
        title: "관리자 글",
        slug: `p${randomSuffix()}`,
        status: "published",
        content: [],
        content_text: "본문",
        author_id: admin.id,
        ...values,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return data.id as string;
  }

  function boardPost(menuId: string, values: Record<string, unknown> = {}) {
    return {
      menu_id: menuId,
      title: "회원 글",
      slug: `m${randomSuffix()}`,
      content: [],
      content_text: "회원 본문",
      ...values,
    };
  }

  test.beforeAll(async ({}, testInfo) => {
    if (testInfo.project.name === "mobile" || !hasSupabase) return;
    admin = await member({ role: "admin" });
    writer = await member();
    commenter = await member();
    voter = await member();
    teacher = await member({
      role: "teacher",
      teacher_status: "approved",
      teacher_school: "테스트학교",
      teacher_position: "교사",
      teacher_subject: "정보",
    });
    pending = await member({
      is_under_14: true,
      guardian_email: "p@example.com",
      status: "pending_guardian",
    });

    studentBoardId = await insertMenu("free", { type: "board", board_write_role: "student" });
    teacherBoardId = await insertMenu("tboard", { type: "board", board_write_role: "teacher" });
    lockedBoardId = await insertMenu("locked", {
      type: "board",
      board_write_role: "student",
      board_allow_comments: false,
      board_allow_votes: false,
    });
    seriesMenuId = await insertMenu("series", { type: "series" });
    noticeId = await insertPost(studentBoardId);
    lockedPostId = await insertPost(lockedBoardId);
  });

  test.afterAll(async () => {
    const menuIds = [studentBoardId, teacherBoardId, lockedBoardId, seriesMenuId].filter(Boolean);
    if (menuIds.length) {
      await db().from("posts").delete().in("menu_id", menuIds);
      await db().from("menus").delete().in("id", menuIds);
    }
    for (const u of users) await deleteTestUser(u.id);
  });

  test("비회원은 공개 글·댓글을 읽기만 한다", async () => {
    await db()
      .from("comments")
      .insert({ post_id: noticeId, body: "관리자 댓글", author_id: admin.id });
    const client = anon();
    const { data: posts } = await client.from("posts").select("id, hot_rank").eq("id", noticeId);
    expect(posts).toHaveLength(1);
    expect(typeof posts![0].hot_rank).toBe("number");
    const { data: comments } = await client.from("comments").select("body").eq("post_id", noticeId);
    expect(comments?.map((c) => c.body)).toContain("관리자 댓글");

    expect((await client.from("posts").insert(boardPost(studentBoardId))).error).not.toBeNull();
    expect(
      (await client.from("comments").insert({ post_id: noticeId, body: "x" })).error,
    ).not.toBeNull();
    const vote = await client.rpc("cast_vote", {
      p_target_type: "post",
      p_target_id: noticeId,
      p_value: 1,
    });
    expect(vote.error).not.toBeNull();
    const report = await client
      .from("reports")
      .insert({ target_type: "post", target_id: noticeId, reason: "spam" });
    expect(report.error).not.toBeNull();
  });

  test("글쓰기 등급: 학생은 교사 게시판·차시 메뉴에 못 쓰고, 동의 대기 회원은 어디에도 못 쓴다", async () => {
    const student = await userClient(voter.email);
    expect((await student.from("posts").insert(boardPost(teacherBoardId))).error).not.toBeNull();
    expect((await student.from("posts").insert(boardPost(seriesMenuId))).error).not.toBeNull();

    const waiting = await userClient(pending.email);
    expect((await waiting.from("posts").insert(boardPost(studentBoardId))).error).not.toBeNull();

    const t = await userClient(teacher.email);
    const { error } = await t.from("posts").insert(boardPost(teacherBoardId));
    expect(error).toBeNull();
  });

  test("회원 글: 관리 항목은 기본값으로 고정되고 1분에 1개만 쓸 수 있다", async () => {
    const client = await userClient(writer.email);
    const { data, error } = await client
      .from("posts")
      .insert(
        boardPost(studentBoardId, {
          title: "가".repeat(300),
          status: "draft",
          is_pinned: true,
          score: 999,
          comment_count: 50,
          author_id: admin.id,
        }),
      )
      .select("id, status, is_pinned, score, comment_count, author_id, published_at")
      .single();
    expect(error).toBeNull();
    expect(data).toMatchObject({
      status: "published",
      is_pinned: false,
      score: 0,
      comment_count: 0,
      author_id: writer.id,
    });
    expect(data!.published_at).not.toBeNull();

    const second = await client.from("posts").insert(boardPost(studentBoardId));
    expect(second.error?.code).toBe("P0429");
  });

  test("작성자는 제목·본문만 고치고 휴지통으로 보낼 수 있다", async () => {
    const client = await userClient(writer.email);
    const { data: mine } = await client
      .from("posts")
      .select("id")
      .eq("author_id", writer.id)
      .single();
    const id = mine!.id as string;

    const edit = await client
      .from("posts")
      .update({ title: "고친 제목" })
      .eq("id", id)
      .select("title");
    expect(edit.error).toBeNull();
    expect(edit.data?.[0]?.title).toBe("고친 제목");

    for (const values of [
      { is_pinned: true },
      { score: 10 },
      { hidden_at: new Date().toISOString() },
    ]) {
      const res = await client.from("posts").update(values).eq("id", id);
      expect(res.error, JSON.stringify(values)).not.toBeNull();
    }

    // 남의 글은 바뀌지 않는다
    const other = await client
      .from("posts")
      .update({ title: "남의 글" })
      .eq("id", noticeId)
      .select("id");
    expect(other.data ?? []).toHaveLength(0);

    const del = await client
      .from("posts")
      .update({ deleted_at: "2000-01-01T00:00:00Z" })
      .eq("id", id)
      .select("deleted_at");
    expect(del.error).toBeNull();
    // 과거 시각을 넣어도 지금 시각으로 고정(휴지통 30일 기준 보호)
    expect(new Date(del.data![0].deleted_at).getFullYear()).toBeGreaterThan(2000);

    const restore = await client
      .from("posts")
      .update({ deleted_at: null })
      .eq("id", id)
      .select("id");
    expect(restore.data ?? []).toHaveLength(0);
    const { data: publicRows } = await anon().from("posts").select("id").eq("id", id);
    expect(publicRows).toHaveLength(0);
  });

  test("댓글: 대댓글 깊이·5단계 제한·10초 제한·댓글 수", async () => {
    const client = await userClient(commenter.email);
    const { data: root, error } = await client
      .from("comments")
      .insert({ post_id: noticeId, body: "첫 댓글" })
      .select("id, depth, author_id")
      .single();
    expect(error).toBeNull();
    expect(root).toMatchObject({ depth: 0, author_id: commenter.id });

    const tooFast = await client.from("comments").insert({ post_id: noticeId, body: "또" });
    expect(tooFast.error?.code).toBe("P0429");

    // 깊이 1~4는 관리자 권한으로 만든다(도배 제한 회피)
    let parentId = root!.id as string;
    for (let depth = 1; depth <= 4; depth++) {
      const { data, error: e } = await db()
        .from("comments")
        .insert({
          post_id: noticeId,
          parent_id: parentId,
          body: `깊이 ${depth}`,
          author_id: admin.id,
        })
        .select("id, depth")
        .single();
      expect(e).toBeNull();
      expect(data!.depth).toBe(depth);
      parentId = data!.id;
    }
    const tooDeep = await db()
      .from("comments")
      .insert({ post_id: noticeId, parent_id: parentId, body: "깊이 5", author_id: admin.id });
    expect(tooDeep.error).not.toBeNull();

    // 다른 글의 댓글을 부모로 쓸 수 없다
    const crossPost = await db()
      .from("comments")
      .insert({ post_id: lockedPostId, parent_id: root!.id, body: "x", author_id: admin.id });
    expect(crossPost.error).not.toBeNull();

    const { data: post } = await db()
      .from("posts")
      .select("comment_count")
      .eq("id", noticeId)
      .single();
    expect(post!.comment_count).toBe(6); // 관리자 댓글 + 첫 댓글 + 깊이 1~4
  });

  test("댓글 수정·삭제: 숨김은 못 바꾸고, 삭제하면 본문이 비고 댓글 수가 준다", async () => {
    const client = await userClient(commenter.email);
    const { data: mine } = await client
      .from("comments")
      .select("id")
      .eq("author_id", commenter.id)
      .single();
    const id = mine!.id as string;

    expect(
      (await client.from("comments").update({ body: "고친 댓글" }).eq("id", id)).error,
    ).toBeNull();
    const hide = await client
      .from("comments")
      .update({ hidden_at: new Date().toISOString() })
      .eq("id", id);
    expect(hide.error).not.toBeNull();
    const score = await client
      .from("comments")
      .update({ score: 5 } as never)
      .eq("id", id);
    expect(score.error).not.toBeNull();

    expect(
      (await client.from("comments").update({ deleted_at: new Date().toISOString() }).eq("id", id))
        .error,
    ).toBeNull();
    const { data: row } = await anon()
      .from("comments")
      .select("body, deleted_at")
      .eq("id", id)
      .single();
    expect(row).toMatchObject({ body: "" });
    expect(row!.deleted_at).not.toBeNull();

    const { data: post } = await db()
      .from("posts")
      .select("comment_count")
      .eq("id", noticeId)
      .single();
    expect(post!.comment_count).toBe(5);
  });

  test("댓글이 꺼진 게시판·동의 대기 회원은 댓글을 쓸 수 없다", async () => {
    const student = await userClient(voter.email);
    expect(
      (await student.from("comments").insert({ post_id: lockedPostId, body: "x" })).error,
    ).not.toBeNull();
    const waiting = await userClient(pending.email);
    expect(
      (await waiting.from("comments").insert({ post_id: noticeId, body: "x" })).error,
    ).not.toBeNull();
  });

  test("투표: 추천 → 전환 → 취소, 본인 투표만 보이고 직접 쓰기는 막힌다", async () => {
    const client = await userClient(voter.email);
    const vote = (value: number, id = noticeId, type = "post") =>
      client.rpc("cast_vote", { p_target_type: type, p_target_id: id, p_value: value });

    const hotRank = async () =>
      (await db().from("posts").select("hot_rank").eq("id", noticeId).single()).data!.hot_rank;
    const before = await hotRank();
    expect((await vote(1)).data).toEqual([{ score: 1, my_vote: 1 }]);
    // SPEC 공식은 log10(max(|score|, 1))이라 점수 0과 1의 인기 점수가 같다
    expect(await hotRank()).toBe(before);

    expect((await vote(1)).data).toEqual([{ score: 1, my_vote: 1 }]); // 같은 값은 그대로
    expect((await vote(-1)).data).toEqual([{ score: -1, my_vote: -1 }]);
    expect((await vote(0)).data).toEqual([{ score: 0, my_vote: 0 }]);
    expect((await vote(2)).error).not.toBeNull();

    // 다른 회원의 투표와 합산
    const other = await userClient(commenter.email);
    await other.rpc("cast_vote", { p_target_type: "post", p_target_id: noticeId, p_value: 1 });
    expect((await vote(1)).data).toEqual([{ score: 2, my_vote: 1 }]);
    expect(await hotRank()).toBeCloseTo(before + Math.log10(2));
    const { data: visible } = await client.from("votes").select("user_id");
    expect(visible?.map((v) => v.user_id)).toEqual([voter.id]);

    const direct = await client
      .from("votes")
      .insert({ user_id: voter.id, target_type: "comment", target_id: noticeId, value: 1 });
    expect(direct.error).not.toBeNull();

    // 추천이 꺼진 게시판, 삭제된 댓글, 동의 대기 회원
    expect((await vote(1, lockedPostId)).error).not.toBeNull();
    const { data: deleted } = await db()
      .from("comments")
      .select("id")
      .eq("author_id", commenter.id)
      .single();
    expect((await vote(1, deleted!.id, "comment")).error).not.toBeNull();
    const waiting = await userClient(pending.email);
    const res = await waiting.rpc("cast_vote", {
      p_target_type: "post",
      p_target_id: noticeId,
      p_value: 1,
    });
    expect(res.error).not.toBeNull();
  });

  test("신고: 중복 불가, 관리자만 처리하고 숨기면 공개 목록에서 빠진다", async () => {
    const target = await insertPost(studentBoardId, { title: "신고 대상" });
    const student = await userClient(voter.email);
    const first = await student
      .from("reports")
      .insert({ target_type: "post", target_id: target, reason: "spam" })
      .select("id, status, reporter_id")
      .single();
    expect(first.error).toBeNull();
    expect(first.data).toMatchObject({ status: "open", reporter_id: voter.id });

    const dup = await student
      .from("reports")
      .insert({ target_type: "post", target_id: target, reason: "other" });
    expect(dup.error).not.toBeNull();
    const forged = await student
      .from("reports")
      .insert({
        target_type: "post",
        target_id: target,
        reason: "spam",
        status: "resolved",
      } as never);
    expect(forged.error).not.toBeNull();

    const another = await userClient(commenter.email);
    await another
      .from("reports")
      .insert({ target_type: "post", target_id: target, reason: "abuse" });
    const { data: othersView } = await another.from("reports").select("id").eq("target_id", target);
    expect(othersView).toHaveLength(1); // 자기 신고만

    const denied = await student.rpc("resolve_report", {
      p_report_id: first.data!.id,
      p_action: "hidden",
    });
    expect(denied.error).not.toBeNull();

    const adminUser = await userClient(admin.email);
    const resolved = await adminUser.rpc("resolve_report", {
      p_report_id: first.data!.id,
      p_action: "hidden",
    });
    expect(resolved.error).toBeNull();

    const { data: reports } = await adminUser
      .from("reports")
      .select("status, resolution")
      .eq("target_id", target);
    expect(reports).toHaveLength(2);
    expect(reports!.every((r) => r.status === "resolved" && r.resolution === "hidden")).toBe(true);
    const { data: publicRows } = await anon().from("posts").select("id").eq("id", target);
    expect(publicRows).toHaveLength(0);
  });

  test("글을 영구 삭제하면 그 글의 투표·신고도 지워진다", async () => {
    const target = await insertPost(studentBoardId, { title: "삭제 대상" });
    const client: SupabaseClient = await userClient(teacher.email);
    await client.rpc("cast_vote", { p_target_type: "post", p_target_id: target, p_value: 1 });
    await client.from("reports").insert({ target_type: "post", target_id: target, reason: "spam" });
    await db().from("posts").delete().eq("id", target);

    const { count: votes } = await db()
      .from("votes")
      .select("*", { count: "exact", head: true })
      .eq("target_id", target);
    const { count: reports } = await db()
      .from("reports")
      .select("*", { count: "exact", head: true })
      .eq("target_id", target);
    expect(votes).toBe(0);
    expect(reports).toBe(0);
  });
});
