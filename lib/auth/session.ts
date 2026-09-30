/** 로그인 유지 기간(F-01: 기본 30일). 요청이 있을 때마다 middleware가 쿠키를 다시 써서 연장된다. */
export const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

type CookieOptionsLike = { maxAge?: number };

/**
 * @supabase/ssr은 쿠키 maxAge를 항상 400일로 고정하므로 setAll에서 30일로 줄인다.
 * 삭제용(maxAge 0) 쿠키는 그대로 둔다.
 */
export function withSessionMaxAge<T extends CookieOptionsLike | undefined>(options: T): T {
  if (!options || options.maxAge === undefined || options.maxAge <= 0) return options;
  return { ...options, maxAge: Math.min(options.maxAge, SESSION_MAX_AGE_SECONDS) };
}

/**
 * 마지막 코드 로그인 후 30일이 지났는지. Supabase 무료 등급에는 세션 최대 수명(Time-box) 설정이 없어
 * middleware가 last_sign_in_at으로 직접 판단해 세션을 끝낸다.
 */
export function isSessionExpired(
  lastSignInAt: string | null | undefined,
  now = new Date(),
): boolean {
  if (!lastSignInAt) return false;
  const signedIn = new Date(lastSignInAt).getTime();
  if (Number.isNaN(signedIn)) return false;
  return now.getTime() - signedIn > SESSION_MAX_AGE_SECONDS * 1000;
}
