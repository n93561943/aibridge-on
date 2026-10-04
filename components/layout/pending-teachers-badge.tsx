/** 관리자 링크 옆 교사 승인 대기 수(F-03 "헤더에 승인 대기 건수 배지") */
export function PendingTeachersBadge({ count }: { count?: number }) {
  if (!count) return null;
  return (
    <span className="ml-auto rounded-full bg-destructive px-1.5 py-0.5 text-[11px] font-semibold text-white tabular-nums">
      <span className="sr-only">교사 승인 대기 </span>
      {count}
    </span>
  );
}
