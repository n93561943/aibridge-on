/** 가입(/signup)을 마치지 않은 로그인 사용자도 들어갈 수 있는 경로 */
const SIGNUP_EXEMPT_PREFIXES = ["/signup", "/login", "/guardian", "/privacy", "/terms"];

export function isSignupExemptPath(pathname: string): boolean {
  return SIGNUP_EXEMPT_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}
