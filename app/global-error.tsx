"use client";

// 루트 레이아웃에서 난 오류를 받는다. 레이아웃을 대체하므로 html·body를 직접 그리고,
// 레이아웃 오류 가능성을 줄이기 위해 전역 CSS·공용 컴포넌트에 의존하지 않는다.
export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="ko">
      <body
        style={{
          margin: 0,
          minHeight: "100dvh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "1rem",
          padding: "0 1rem",
          textAlign: "center",
          fontFamily: "system-ui, sans-serif",
          color: "#111",
          background: "#fff",
        }}
      >
        <h1 style={{ fontSize: "1.5rem", fontWeight: 700, margin: 0 }}>문제가 발생했습니다</h1>
        <p style={{ margin: 0, color: "#555" }}>잠시 후 다시 시도해 주세요.</p>
        <button
          type="button"
          onClick={reset}
          style={{
            padding: "0.625rem 1.25rem",
            borderRadius: "0.5rem",
            border: "none",
            background: "#111",
            color: "#fff",
            fontSize: "1rem",
            cursor: "pointer",
          }}
        >
          다시 시도
        </button>
      </body>
    </html>
  );
}
