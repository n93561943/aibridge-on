/** 이용 정지 안내(P6 결정: 로그인은 되지만 읽기만 가능) */
export function SuspendedBanner() {
  return (
    <div
      role="region"
      aria-label="이용 정지 안내"
      className="border-b bg-red-50 text-red-950 dark:bg-red-950/40 dark:text-red-100 print:hidden"
    >
      <p className="container-site py-3 text-sm">
        <strong>이용이 정지된 계정</strong>입니다. 자료는 볼 수 있지만 글쓰기·댓글·추천·신고는 할 수
        없습니다. 문의는 사이트 운영자에게 해 주세요.
      </p>
    </div>
  );
}
