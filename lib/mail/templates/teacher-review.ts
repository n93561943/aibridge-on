import { escapeHtml } from "@/lib/html";
import type { MailMessage } from "@/lib/mail/send";
import { siteConfig } from "@/lib/site";

type TeacherReviewMailInput = {
  to: string;
  nickname: string;
  approved: boolean;
  /** 반려 사유(반려일 때만) */
  reason?: string | null;
  /** 내 정보 주소(절대 URL) */
  meUrl: string;
};

/** 교사 신청 승인·반려 결과 메일(F-03). 반려 사유를 함께 알린다. */
export function teacherReviewMail(input: TeacherReviewMailInput): MailMessage {
  const result = input.approved ? "승인되었습니다" : "반려되었습니다";
  const subject = `[${siteConfig.name}] 교사 신청이 ${result}`;
  const body = input.approved
    ? [
        "이제 교사 전용 자료와 교사 기능을 쓸 수 있습니다.",
        "다시 로그인하거나 새로고침하면 바로 반영됩니다.",
      ]
    : [
        `반려 사유: ${input.reason ?? "(사유 없음)"}`,
        "내 정보에서 교사 정보를 고쳐 다시 신청할 수 있습니다.",
      ];
  const text = [
    `안녕하세요, ${input.nickname}님. ${siteConfig.name}입니다.`,
    "",
    `신청하신 교사 등급이 ${result}.`,
    ...body,
    "",
    input.meUrl,
  ].join("\n");

  const html = `<div style="font-family:sans-serif;line-height:1.6;color:#111">
<p>안녕하세요, <strong>${escapeHtml(input.nickname)}</strong>님. ${escapeHtml(siteConfig.name)}입니다.</p>
<p>신청하신 교사 등급이 <strong>${result}</strong>.</p>
${body.map((line) => `<p>${escapeHtml(line)}</p>`).join("\n")}
<p><a href="${escapeHtml(input.meUrl)}" style="display:inline-block;padding:10px 18px;background:#111;color:#fff;border-radius:6px;text-decoration:none">내 정보 보기</a></p>
</div>`;

  return { to: input.to, subject, text, html };
}
