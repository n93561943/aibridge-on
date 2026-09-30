import { defineConfig, devices } from "@playwright/test";

// Node 20에는 전역 WebSocket이 없어 테스트 헬퍼의 supabase-js 생성이 실패한다.
// 설정을 읽은 뒤 뜨는 테스트 워커에서 켜지도록 NODE_OPTIONS에 추가한다.
if (
  !("WebSocket" in globalThis) &&
  !process.env.NODE_OPTIONS?.includes("--experimental-websocket")
) {
  process.env.NODE_OPTIONS = `${process.env.NODE_OPTIONS ?? ""} --experimental-websocket`.trim();
}

const PORT = Number(process.env.PORT ?? 3000);
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL,
    locale: "ko-KR",
    trace: "on-first-retry",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    // 모바일 기준 폭 390px
    {
      name: "mobile",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
      },
    },
  ],
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        command: `npm run build && npm run start -- -p ${PORT}`,
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 180_000,
      },
});
