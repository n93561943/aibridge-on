import { describe, expect, it } from "vitest";

import { parseSignupInput } from "@/lib/validation/signup";

const USER_EMAIL = "Student@Example.com";

const teacher = {
  applyTeacher: "on",
  teacherSchool: "한빛중학교",
  teacherPosition: "교사",
  teacherSubject: "정보",
};

function input(overrides: Record<string, unknown> = {}) {
  return { nickname: "코딩왕", privacyAgreed: "on", ageGroup: "over14", ...overrides };
}

describe("parseSignupInput: 공통", () => {
  it("만 14세 이상 학생 가입", () => {
    expect(parseSignupInput(input(), USER_EMAIL)).toEqual({
      ok: true,
      data: { nickname: "코딩왕", isUnder14: false, teacher: null, guardianEmail: null },
    });
  });

  it("개인정보 동의가 없으면 거부", () => {
    const r = parseSignupInput(input({ privacyAgreed: undefined }), USER_EMAIL);
    expect(r).toMatchObject({ ok: false, errors: { privacyAgreed: expect.any(String) } });
  });

  it("14세 이상 여부를 고르지 않으면 거부", () => {
    const r = parseSignupInput(input({ ageGroup: undefined }), USER_EMAIL);
    expect(r).toMatchObject({ ok: false, errors: { ageGroup: expect.any(String) } });
  });

  it("닉네임 길이·허용 문자 검사", () => {
    expect(parseSignupInput(input({ nickname: "가" }), USER_EMAIL).ok).toBe(false);
    expect(parseSignupInput(input({ nickname: "a".repeat(21) }), USER_EMAIL).ok).toBe(false);
    expect(parseSignupInput(input({ nickname: "<script>" }), USER_EMAIL).ok).toBe(false);
    expect(parseSignupInput(input({ nickname: " Kim_01 " }), USER_EMAIL)).toMatchObject({
      ok: true,
      data: { nickname: "Kim_01" },
    });
  });
});

describe("parseSignupInput: 교사 신청", () => {
  it("학교·직급·과목을 모두 입력하면 교사 신청 정보가 담긴다", () => {
    expect(parseSignupInput(input(teacher), USER_EMAIL)).toEqual({
      ok: true,
      data: {
        nickname: "코딩왕",
        isUnder14: false,
        guardianEmail: null,
        teacher: { teacherSchool: "한빛중학교", teacherPosition: "교사", teacherSubject: "정보" },
      },
    });
  });

  it("학교·직급·과목 중 빠진 항목이 있으면 거부", () => {
    const r = parseSignupInput(
      input({ ...teacher, teacherSchool: " ", teacherPosition: "교무부장" }),
      USER_EMAIL,
    );
    expect(r).toMatchObject({
      ok: false,
      errors: { teacherSchool: expect.any(String), teacherPosition: expect.any(String) },
    });
  });

  it("교사 신청을 안 하면 교사 입력값은 무시한다", () => {
    const r = parseSignupInput(input({ ...teacher, applyTeacher: undefined }), USER_EMAIL);
    expect(r).toMatchObject({ ok: true, data: { teacher: null } });
  });
});

describe("parseSignupInput: 만 14세 미만(보호자 동의)", () => {
  it("보호자 이메일이 있으면 가입 가능, 소문자로 정규화", () => {
    expect(
      parseSignupInput(
        input({ ageGroup: "under14", guardianEmail: " Parent@Example.com " }),
        USER_EMAIL,
      ),
    ).toEqual({
      ok: true,
      data: {
        nickname: "코딩왕",
        isUnder14: true,
        teacher: null,
        guardianEmail: "parent@example.com",
      },
    });
  });

  it("보호자 이메일이 없거나 잘못되면 거부", () => {
    expect(parseSignupInput(input({ ageGroup: "under14" }), USER_EMAIL)).toMatchObject({
      ok: false,
      errors: { guardianEmail: "보호자 이메일을 입력해 주세요." },
    });
    expect(
      parseSignupInput(input({ ageGroup: "under14", guardianEmail: "parent" }), USER_EMAIL),
    ).toMatchObject({ ok: false, errors: { guardianEmail: expect.any(String) } });
  });

  it("보호자 이메일이 본인 이메일과 같으면 거부(대소문자 무시)", () => {
    const r = parseSignupInput(
      input({ ageGroup: "under14", guardianEmail: "student@example.COM" }),
      USER_EMAIL,
    );
    expect(r).toMatchObject({
      ok: false,
      errors: { guardianEmail: "보호자 이메일은 본인 이메일과 달라야 합니다." },
    });
  });

  it("만 14세 미만은 교사 신청을 할 수 없다", () => {
    const r = parseSignupInput(
      input({ ...teacher, ageGroup: "under14", guardianEmail: "parent@example.com" }),
      USER_EMAIL,
    );
    expect(r).toMatchObject({ ok: false, errors: { applyTeacher: expect.any(String) } });
  });
});
