/** 로그인 코드 정책(F-01). Supabase 대시보드의 OTP 만료·발송 간격 설정과 맞춘다. */
export const OTP_LENGTH = 6;
export const OTP_MAX_FAILURES = 5;
export const OTP_RESEND_COOLDOWN_SECONDS = 60;
export const OTP_EXPIRY_SECONDS = 10 * 60;

export const otpCodeRegex = new RegExp(`^\\d{${OTP_LENGTH}}$`);

export type OtpAttemptRecord = { fail_count: number; issued_at: string };

/** 현재 코드로 더 검증할 수 있는지. 오류 5회면 새 코드를 받아야 한다. */
export function isOtpLocked(record: OtpAttemptRecord | null): boolean {
  return (record?.fail_count ?? 0) >= OTP_MAX_FAILURES;
}

export function remainingOtpAttempts(record: OtpAttemptRecord | null): number {
  return Math.max(0, OTP_MAX_FAILURES - (record?.fail_count ?? 0));
}
