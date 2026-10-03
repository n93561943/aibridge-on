/** 온라인 저지 문제 번호: 영문·숫자·하이픈, 최대 20자 */
export const JUDGE_PROBLEM_ID = /^[A-Za-z0-9-]{1,20}$/;

export const ONLINE_JUDGE_SETTING_KEY = "online_judge_problem_url";

/**
 * 문제 주소 만들기. 설정 형식("https://…/problem/{id}")이 없거나 올바르지 않으면 null(버튼 비활성).
 * 도메인은 코드에 쓰지 않고 site_settings에서만 읽는다.
 */
export function buildJudgeUrl(
  template: string | null | undefined,
  problemId: string,
): string | null {
  if (!template || !template.includes("{id}") || !JUDGE_PROBLEM_ID.test(problemId)) return null;
  const url = template.split("{id}").join(encodeURIComponent(problemId));
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.toString() : null;
  } catch {
    return null;
  }
}
