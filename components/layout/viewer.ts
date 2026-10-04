import type { UserRole } from "@/lib/auth/roles";

/** 헤더에 보여 줄 로그인 사용자 정보(개인정보 최소화: 닉네임·등급·상태만) */
export type HeaderViewer = {
  /** 가입(/signup)을 마치지 않았으면 null */
  nickname: string | null;
  role: UserRole | null;
  pendingGuardian: boolean;
  /** 관리자에게 이용 정지된 계정(읽기만 가능) */
  suspended?: boolean;
  /** 관리자에게만: 교사 승인 대기 수(헤더 배지) */
  pendingTeachers?: number;
};
