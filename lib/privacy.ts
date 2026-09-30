/** 이메일 일부만 보여 준다(예: ab***@example.com). 보호자 동의 화면처럼 링크가 전달될 수 있는 곳에 쓴다. */
export function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!local || !domain) return "***";
  const visible = local.slice(0, Math.min(2, Math.max(1, local.length - 1)));
  return `${visible}${"*".repeat(Math.max(1, local.length - visible.length))}@${domain}`;
}
