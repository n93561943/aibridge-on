import { z } from "zod";

import { emailSchema, normalizeEmail } from "@/lib/auth/email";

export const TEACHER_POSITIONS = ["교사", "부장교사", "교감", "교장", "기타"] as const;

// 폼 체크박스·라디오 값("on", "true" 등)을 boolean으로
const formBoolean = z.preprocess((v) => v === true || v === "on" || v === "true", z.boolean());

const optionalText = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v ? v : undefined));

export const nicknameSchema = z
  .string({ error: "닉네임을 입력해 주세요." })
  .trim()
  .min(2, "닉네임은 2자 이상이어야 합니다.")
  .max(20, "닉네임은 20자 이하여야 합니다.")
  .regex(/^[가-힣a-zA-Z0-9_-]+$/, "닉네임은 한글·영문·숫자·밑줄(_)·하이픈(-)만 쓸 수 있습니다.");

export const teacherInfoSchema = z.object({
  teacherSchool: z
    .string({ error: "소속 학교를 입력해 주세요." })
    .trim()
    .min(1, "소속 학교를 입력해 주세요.")
    .max(100, "학교 이름은 100자 이하여야 합니다."),
  teacherPosition: z.enum(TEACHER_POSITIONS, { error: "직급을 선택해 주세요." }),
  teacherSubject: z
    .string({ error: "과목을 입력해 주세요." })
    .trim()
    .min(1, "과목을 입력해 주세요.")
    .max(50, "과목은 50자 이하여야 합니다."),
});

export type TeacherInfo = z.infer<typeof teacherInfoSchema>;

const signupFormSchema = z.object({
  nickname: nicknameSchema,
  privacyAgreed: formBoolean,
  ageGroup: z.enum(["over14", "under14"], { error: "만 14세 이상인지 선택해 주세요." }),
  applyTeacher: formBoolean,
  teacherSchool: optionalText,
  teacherPosition: optionalText,
  teacherSubject: optionalText,
  guardianEmail: optionalText,
});

export type SignupInput =
  | {
      nickname: string;
      isUnder14: false;
      teacher: TeacherInfo | null;
      guardianEmail: null;
    }
  | {
      nickname: string;
      isUnder14: true;
      teacher: null;
      guardianEmail: string;
    };

export type FieldErrors = Record<string, string>;

export type ParseResult<T> = { ok: true; data: T } | { ok: false; errors: FieldErrors };

function firstIssues(error: z.ZodError, prefix = ""): FieldErrors {
  const errors: FieldErrors = {};
  for (const issue of error.issues) {
    const key = prefix + String(issue.path[0] ?? "form");
    errors[key] ??= issue.message;
  }
  return errors;
}

/**
 * /signup 입력 검증(서버에서 반드시 다시 호출).
 * - 만 14세 미만: 보호자 이메일 필수(본인 이메일 불가), 교사 신청 불가
 * - 교사 신청: 학교·직급·과목 필수
 */
export function parseSignupInput(raw: unknown, userEmail: string): ParseResult<SignupInput> {
  const parsed = signupFormSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, errors: firstIssues(parsed.error) };
  const form = parsed.data;
  const errors: FieldErrors = {};

  if (!form.privacyAgreed)
    errors.privacyAgreed = "개인정보 수집·이용에 동의해야 가입할 수 있습니다.";

  if (form.ageGroup === "under14") {
    if (form.applyTeacher) errors.applyTeacher = "교사 가입은 만 14세 이상만 신청할 수 있습니다.";
    const guardian = emailSchema.safeParse(form.guardianEmail ?? "");
    if (!guardian.success) {
      errors.guardianEmail = form.guardianEmail
        ? "올바른 보호자 이메일을 입력해 주세요."
        : "보호자 이메일을 입력해 주세요.";
    } else if (guardian.data === normalizeEmail(userEmail)) {
      errors.guardianEmail = "보호자 이메일은 본인 이메일과 달라야 합니다.";
    }
    if (Object.keys(errors).length > 0 || !guardian.success) return { ok: false, errors };
    return {
      ok: true,
      data: {
        nickname: form.nickname,
        isUnder14: true,
        teacher: null,
        guardianEmail: guardian.data,
      },
    };
  }

  let teacher: TeacherInfo | null = null;
  if (form.applyTeacher) {
    const t = teacherInfoSchema.safeParse(form);
    if (!t.success) Object.assign(errors, firstIssues(t.error));
    else teacher = t.data;
  }
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    data: { nickname: form.nickname, isUnder14: false, teacher, guardianEmail: null },
  };
}

/** /me 닉네임 수정 */
export const profileNicknameSchema = z.object({ nickname: nicknameSchema });
