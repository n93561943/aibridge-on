import { z } from "zod";

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export const emailSchema = z
  .string({ error: "이메일을 입력해 주세요." })
  .trim()
  .min(1, "이메일을 입력해 주세요.")
  .max(254, "이메일이 너무 깁니다.")
  .pipe(z.email("올바른 이메일 주소를 입력해 주세요."))
  .transform(normalizeEmail);

/** 관리자 시드(ADMIN_EMAILS) 여부. 목록은 env.server에서 소문자·공백 제거된 상태로 온다. */
export function isAdminEmail(email: string, adminEmails: readonly string[]): boolean {
  return adminEmails.includes(normalizeEmail(email));
}
