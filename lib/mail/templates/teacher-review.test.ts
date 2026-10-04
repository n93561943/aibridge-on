import { describe, expect, it } from "vitest";

import { teacherReviewMail } from "./teacher-review";

describe("교사 심사 결과 메일", () => {
  it("승인: 제목과 안내", () => {
    const mail = teacherReviewMail({
      to: "t@example.com",
      nickname: "선생님",
      approved: true,
      meUrl: "https://site.test/me",
    });
    expect(mail.to).toBe("t@example.com");
    expect(mail.subject).toContain("승인되었습니다");
    expect(mail.text).toContain("교사 전용 자료");
    expect(mail.text).not.toContain("반려 사유");
    expect(mail.html).toContain('href="https://site.test/me"');
  });

  it("반려: 사유를 넣고 HTML은 이스케이프한다", () => {
    const mail = teacherReviewMail({
      to: "t@example.com",
      nickname: "<b>닉</b>",
      approved: false,
      reason: '재직 증빙이 필요합니다 <script>alert("x")</script>',
      meUrl: "https://site.test/me",
    });
    expect(mail.subject).toContain("반려되었습니다");
    expect(mail.text).toContain("반려 사유: 재직 증빙이 필요합니다");
    expect(mail.html).not.toContain("<script>");
    expect(mail.html).toContain("&lt;script&gt;");
    expect(mail.html).not.toContain("<b>닉</b>");
  });
});
