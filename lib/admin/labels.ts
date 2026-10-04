/** 회원 관리 화면 표시 문구(F-03) */

export const statusLabels: Record<string, string> = {
  active: "활동",
  suspended: "이용 정지",
  pending_guardian: "보호자 동의 대기",
};

export const teacherStatusLabels: Record<string, string> = {
  none: "신청 안 함",
  pending: "승인 대기",
  approved: "승인됨",
  rejected: "반려됨",
};

export const auditActionLabels: Record<string, string> = {
  teacher_approve: "교사 승인",
  teacher_reject: "교사 반려",
  role_change: "등급 변경",
  status_change: "상태 변경",
  force_withdraw: "강제 탈퇴",
  guardian_resend: "보호자 메일 재발송",
};

export const adminDateTime = new Intl.DateTimeFormat("ko-KR", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Seoul",
});

export const adminDate = new Intl.DateTimeFormat("ko-KR", {
  dateStyle: "medium",
  timeZone: "Asia/Seoul",
});
