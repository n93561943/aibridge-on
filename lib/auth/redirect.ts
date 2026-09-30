/** 로그인 후 돌아갈 경로. 외부 주소로의 오픈 리다이렉트를 막기 위해 사이트 내부 경로만 허용한다. */
export function safeNextPath(next: unknown, fallback = "/"): string {
  if (typeof next !== "string") return fallback;
  const path = next.trim();
  if (!path.startsWith("/") || path.startsWith("//") || path.startsWith("/\\")) return fallback;
  // 제어 문자·역슬래시는 브라우저마다 해석이 달라 거부한다.
  if (/[\\\u0000-\u001f]/.test(path)) return fallback;
  // 로그인·가입 화면으로 되돌아가는 순환 방지
  if (/^\/(login|signup)(\/|\?|$)/.test(path)) return fallback;
  return path;
}
