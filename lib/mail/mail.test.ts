import { describe, expect, it, vi } from "vitest";

import { sendMailWith } from "@/lib/mail/send";
import { guardianConsentMail } from "@/lib/mail/templates/guardian-consent";

const message = { to: "parent@example.com", subject: "제목", text: "본문", html: "<p>본문</p>" };

describe("sendMailWith", () => {
  it("개발 환경에서 키가 없으면 서버 로그로 대체한다", async () => {
    const log = vi.fn();
    const fetchFn = vi.fn();
    const result = await sendMailWith(message, { isProduction: false, log, fetchFn });
    expect(result).toEqual({ ok: true, via: "dev-log" });
    expect(log).toHaveBeenCalledWith(expect.stringContaining("parent@example.com"));
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("운영 환경에서 키가 없으면 실패를 반환한다(로그 대체 금지)", async () => {
    const log = vi.fn();
    const result = await sendMailWith(message, { isProduction: true, log });
    expect(result.ok).toBe(false);
    expect(log).not.toHaveBeenCalled();
  });

  it("키가 있으면 Resend API로 보낸다", async () => {
    const fetchFn = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    const result = await sendMailWith(message, {
      apiKey: "re_test",
      from: "AI Bridge:ON <no-reply@example.com>",
      isProduction: true,
      fetchFn,
    });
    expect(result).toEqual({ ok: true, via: "resend" });
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe("https://api.resend.com/emails");
    expect(init.headers.Authorization).toBe("Bearer re_test");
    expect(JSON.parse(init.body)).toMatchObject({ to: ["parent@example.com"], subject: "제목" });
  });

  it("Resend 오류·발신 주소 누락은 실패", async () => {
    const fetchFn = vi.fn().mockResolvedValue(new Response("{}", { status: 422 }));
    expect(
      (await sendMailWith(message, { apiKey: "k", from: "a@b.c", isProduction: true, fetchFn })).ok,
    ).toBe(false);
    expect((await sendMailWith(message, { apiKey: "k", isProduction: true })).ok).toBe(false);
  });
});

describe("guardianConsentMail", () => {
  const mail = guardianConsentMail({
    to: "parent@example.com",
    nickname: `<img src=x onerror="alert(1)">`,
    consentUrl: "https://site.example/guardian/consent?token=abc&x=1",
    expiresAt: new Date("2026-10-08T00:00:00Z"),
  });

  it("닉네임 등 값은 HTML 이스케이프한다", () => {
    expect(mail.html).not.toContain("<img");
    expect(mail.html).toContain("&lt;img");
    expect(mail.html).toContain("token=abc&amp;x=1");
  });

  it("텍스트 본문에 동의 링크와 자동 삭제 안내가 있다", () => {
    expect(mail.to).toBe("parent@example.com");
    expect(mail.text).toContain("https://site.example/guardian/consent?token=abc&x=1");
    expect(mail.text).toContain("자동으로 삭제");
  });
});
