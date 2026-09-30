/** 로그인 코드 정책(F-01). Supabase 대시보드의 OTP 만료·발송 간격 설정과 맞춘다. */
export const OTP_LENGTH = 6;
export const OTP_MAX_FAILURES = 5;
export const OTP_RESEND_COOLDOWN_SECONDS = 60;
export const OTP_EXPIRY_SECONDS = 10 * 60;

export const otpCodeRegex = new RegExp(`^\\d{${OTP_LENGTH}}$`);

/**
 * 검증 전에 시도 1회를 먼저 차감한 누적 횟수(attempts)로 판단한다.
 * 5회까지는 검증하고, 6번째 요청부터는 새 코드를 받아야 한다.
 */
export function isOverOtpLimit(attempts: number): boolean {
  return attempts > OTP_MAX_FAILURES;
}

/** 이번 시도가 실패했을 때 남는 횟수 */
export function remainingOtpAttempts(attempts: number): number {
  return Math.max(0, OTP_MAX_FAILURES - attempts);
}

/** 인증 서버 쪽 문제(요청 과다·서버 오류)면 코드 오류로 세지 않는다. */
export function isAuthServiceError(status: number | undefined): boolean {
  return status === 429 || (status !== undefined && status >= 500);
}
