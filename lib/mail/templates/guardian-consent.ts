import { escapeHtml } from "@/lib/html";
import { siteConfig } from "@/lib/site";
import type { MailMessage } from "@/lib/mail/send";

type GuardianConsentMailInput = {
  to: string;
  nickname: string;
  consentUrl: string;
  expiresAt: Date;
};

const dateFormatter = new Intl.DateTimeFormat("ko-KR", {
  dateStyle: "long",
  timeStyle: "short",
  timeZone: "Asia/Seoul",
});

/** 만 14세 미만 가입자의 보호자에게 보내는 동의 요청 메일 */
export function guardianConsentMail(input: GuardianConsentMailInput): MailMessage {
  const expires = dateFormatter.format(input.expiresAt);
  const subject = `[${siteConfig.name}] 자녀의 회원가입 동의를 요청드립니다`;
  const text = [
    `안녕하세요. ${siteConfig.name}입니다.`,
    "",
    `만 14세 미만 회원(닉네임: ${input.nickname})이 가입하면서 이 이메일을 보호자 연락처로 입력했습니다.`,
    "개인정보 보호법에 따라 법정대리인(보호자)의 동의가 필요합니다.",
    "",
    `아래 링크에서 수집 항목과 이용 목적을 확인하고 동의해 주세요. (유효기간: ${expires}까지)`,
    input.consentUrl,
    "",
    "기간 안에 동의하지 않으면 해당 계정과 개인정보는 자동으로 삭제됩니다.",
    "본인과 관련 없는 메일이라면 무시하셔도 됩니다.",
  ].join("\n");

  const nickname = escapeHtml(input.nickname);
  const url = escapeHtml(input.consentUrl);
  const html = `<div style="font-family:sans-serif;line-height:1.6;color:#111">
<p>안녕하세요. ${escapeHtml(siteConfig.name)}입니다.</p>
<p>만 14세 미만 회원(닉네임: <strong>${nickname}</strong>)이 가입하면서 이 이메일을 보호자 연락처로 입력했습니다.<br>개인정보 보호법에 따라 법정대리인(보호자)의 동의가 필요합니다.</p>
<p><a href="${url}" style="display:inline-block;padding:10px 18px;background:#111;color:#fff;border-radius:6px;text-decoration:none">동의 내용 확인하기</a></p>
<p style="font-size:13px;color:#555">유효기간: ${escapeHtml(expires)}까지<br>기간 안에 동의하지 않으면 해당 계정과 개인정보는 자동으로 삭제됩니다.<br>본인과 관련 없는 메일이라면 무시하셔도 됩니다.</p>
</div>`;

  return { to: input.to, subject, text, html };
}
