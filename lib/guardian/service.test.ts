import { beforeEach, describe, expect, it, vi } from "vitest";

const sendMail = vi.fn();
vi.mock("@/lib/mail/send", () => ({ sendMail: (...args: unknown[]) => sendMail(...args) }));

type Call = { table: string; op: string; filters: [string, string, unknown][]; values?: unknown };
const calls: Call[] = [];
let rpcResult: { data: unknown; error: unknown } = { data: "ok", error: null };
let deletedRows: { created_at: string }[] = [];

/** 호출 내역만 기록하는 최소한의 가짜 쿼리 빌더 */
function query(table: string) {
  const call: Call = { table, op: "", filters: [] };
  const builder = {
    delete() {
      call.op = "delete";
      calls.push(call);
      return builder;
    },
    update(values: unknown) {
      call.op = "update";
      call.values = values;
      calls.push(call);
      return builder;
    },
    eq(col: string, val: unknown) {
      call.filters.push(["eq", col, val]);
      return builder;
    },
    is(col: string, val: unknown) {
      call.filters.push(["is", col, val]);
      return builder;
    },
    select() {
      return Promise.resolve({ data: deletedRows, error: null });
    },
    then(resolve: (v: unknown) => void) {
      resolve({ data: null, error: null });
    },
  };
  return builder;
}

const rpc = vi.fn(async () => rpcResult);
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ rpc, from: (table: string) => query(table) }),
}));

const { sendGuardianConsent } = await import("@/lib/guardian/service");

const target = {
  id: "profile-1",
  nickname: "어린이",
  guardian_email: "parent@example.com",
  created_at: new Date().toISOString(),
};

beforeEach(() => {
  calls.length = 0;
  sendMail.mockReset();
  rpc.mockClear();
  rpcResult = { data: "ok", error: null };
  deletedRows = [{ created_at: "2026-10-02T11:57:44.653469+00:00" }];
});

describe("sendGuardianConsent", () => {
  it("발급과 메일 발송이 성공하면 ok이고 아무것도 되돌리지 않는다", async () => {
    sendMail.mockResolvedValue({ ok: true, via: "resend" });
    expect(await sendGuardianConsent(target)).toEqual({ ok: true });
    expect(rpc).toHaveBeenCalledWith(
      "issue_guardian_token",
      expect.objectContaining({ p_profile_id: "profile-1" }),
    );
    expect(sendMail).toHaveBeenCalledWith(expect.objectContaining({ to: "parent@example.com" }));
    expect(calls).toHaveLength(0);
  });

  it("메일 전송이 실패하면 새 토큰을 지우고 이전 토큰을 다시 살린다(재발송 횟수 미차감)", async () => {
    sendMail.mockResolvedValue({ ok: false, error: "실패" });
    expect(await sendGuardianConsent(target)).toEqual({ ok: false, reason: "mail_failed" });

    const tokenHash = (rpc.mock.calls[0] as unknown as [string, { p_token_hash: string }])[1]
      .p_token_hash;
    const [del, restore] = calls;
    expect(del).toMatchObject({ table: "guardian_consents", op: "delete" });
    expect(del.filters).toEqual(
      expect.arrayContaining([
        ["eq", "profile_id", "profile-1"],
        ["eq", "token_hash", tokenHash],
      ]),
    );
    expect(restore).toMatchObject({ op: "update", values: { revoked_at: null } });
    // 이번 발급 때 무효화된 토큰만(revoked_at = 새 토큰 생성 시각), 동의 전 토큰만 살린다
    expect(restore.filters).toEqual(
      expect.arrayContaining([
        ["eq", "profile_id", "profile-1"],
        ["eq", "revoked_at", "2026-10-02T11:57:44.653469+00:00"],
        ["is", "consented_at", null],
      ]),
    );
  });

  it("지울 토큰을 찾지 못하면 이전 토큰을 건드리지 않는다", async () => {
    sendMail.mockResolvedValue({ ok: false, error: "실패" });
    deletedRows = [];
    await sendGuardianConsent(target);
    expect(calls.map((c) => c.op)).toEqual(["delete"]);
  });

  it("발급 단계에서 거절되면(간격·한도) 메일을 보내지 않는다", async () => {
    rpcResult = { data: "cooldown:30", error: null };
    expect(await sendGuardianConsent(target)).toEqual({
      ok: false,
      reason: "cooldown",
      retryAfterSeconds: 30,
    });
    expect(sendMail).not.toHaveBeenCalled();
    expect(calls).toHaveLength(0);
  });

  it("DB 오류면 db_failed", async () => {
    rpcResult = { data: null, error: { message: "boom" } };
    expect(await sendGuardianConsent(target)).toEqual({ ok: false, reason: "db_failed" });
    expect(sendMail).not.toHaveBeenCalled();
  });
});
