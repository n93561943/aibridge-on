export const USER_ROLES = ["student", "teacher", "admin"] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const roleLabels: Record<UserRole, string> = {
  student: "학생",
  teacher: "교사",
  admin: "관리자",
};

/** DB의 role(text + check 제약)을 타입으로 좁힌다. 알 수 없는 값은 가장 낮은 권한으로 본다. */
export function toUserRole(value: string | null | undefined): UserRole {
  return USER_ROLES.includes(value as UserRole) ? (value as UserRole) : "student";
}
