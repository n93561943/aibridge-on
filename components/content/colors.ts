/** BlockNote 기본 색 이름 → 실제 색. 정해진 이름만 쓰고 나머지는 무시한다(임의 CSS 주입 방지). */
const TEXT: Record<string, string> = {
  gray: "#6b7280",
  brown: "#92400e",
  red: "#dc2626",
  orange: "#ea580c",
  yellow: "#a16207",
  green: "#15803d",
  blue: "#1d4ed8",
  purple: "#7e22ce",
  pink: "#be185d",
};
const BACKGROUND: Record<string, string> = {
  gray: "#f3f4f6",
  brown: "#f5ebe0",
  red: "#fee2e2",
  orange: "#ffedd5",
  yellow: "#fef9c3",
  green: "#dcfce7",
  blue: "#dbeafe",
  purple: "#f3e8ff",
  pink: "#fce7f3",
};

export function colorStyle(
  textColor: unknown,
  backgroundColor: unknown,
): React.CSSProperties | undefined {
  const color = typeof textColor === "string" ? TEXT[textColor] : undefined;
  const background = typeof backgroundColor === "string" ? BACKGROUND[backgroundColor] : undefined;
  if (!color && !background) return undefined;
  return { ...(color ? { color } : {}), ...(background ? { backgroundColor: background } : {}) };
}

const ALIGN: Record<string, string> = {
  center: "text-center",
  right: "text-right",
  justify: "text-justify",
};
export function alignClass(value: unknown): string {
  return typeof value === "string" ? (ALIGN[value] ?? "") : "";
}
