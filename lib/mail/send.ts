import "server-only";

import { getServerEnv } from "@/lib/env.server";

export type MailMessage = {
  to: string;
  subject: string;
  text: string;
  html: string;
};

export type SendMailResult = { ok: true; via: "resend" | "dev-log" } | { ok: false; error: string };

type SendMailDeps = {
  apiKey?: string;
  from?: string;
  isProduction: boolean;
  fetchFn?: typeof fetch;
  log?: (message: string) => void;
};

const RESEND_ENDPOINT = "https://api.resend.com/emails";

/**
 * 메일 발송. RESEND_API_KEY가 없으면 개발 환경에서만 서버 로그로 대체한다.
 * 운영 환경에서 키가 없으면 실패를 반환한다(보호자 동의 메일이 조용히 사라지지 않게).
 */
export async function sendMailWith(
  message: MailMessage,
  deps: SendMailDeps,
): Promise<SendMailResult> {
  if (!deps.apiKey) {
    if (deps.isProduction)
      return { ok: false, error: "메일 발송 설정(RESEND_API_KEY)이 없습니다." };
    (deps.log ?? console.info)(
      `[메일 대체: 개발 환경] to=${message.to}\n제목: ${message.subject}\n${message.text}`,
    );
    return { ok: true, via: "dev-log" };
  }
  if (!deps.from) return { ok: false, error: "발신 주소(MAIL_FROM)가 설정되지 않았습니다." };

  try {
    const res = await (deps.fetchFn ?? fetch)(RESEND_ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Bearer ${deps.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: deps.from,
        to: [message.to],
        subject: message.subject,
        text: message.text,
        html: message.html,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return { ok: false, error: `메일 발송 실패(${res.status})` };
    return { ok: true, via: "resend" };
  } catch {
    return { ok: false, error: "메일 서버에 연결하지 못했습니다." };
  }
}

export function sendMail(message: MailMessage): Promise<SendMailResult> {
  const env = getServerEnv();
  return sendMailWith(message, {
    apiKey: env.RESEND_API_KEY,
    from: env.MAIL_FROM,
    isProduction: process.env.NODE_ENV === "production",
  });
}
