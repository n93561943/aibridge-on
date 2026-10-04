import "server-only";
import { z } from "zod";

const optionalString = z
  .string()
  .trim()
  .transform((v) => (v === "" ? undefined : v))
  .optional();

const serverEnvSchema = z.object({
  SUPABASE_SERVICE_ROLE_KEY: optionalString,
  RESEND_API_KEY: optionalString,
  ANTHROPIC_API_KEY: optionalString,
  // 빈 문자열도 기본값으로 처리한다. 단가가 0이 되면 월 예산 검사가 무력화된다(D5).
  ANTHROPIC_MODEL: optionalString.pipe(z.string().default("claude-haiku-4-5")),
  AI_PRICE_INPUT_USD_PER_MTOK: optionalString.pipe(
    z.coerce.number<string | undefined>().positive().default(1),
  ),
  AI_PRICE_OUTPUT_USD_PER_MTOK: optionalString.pipe(
    z.coerce.number<string | undefined>().positive().default(5),
  ),
  ADMIN_EMAILS: z
    .string()
    .default("")
    .transform((v) =>
      v
        .split(",")
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean),
    ),
  MAIL_FROM: optionalString,
  // Vercel Cron 호출 인증(휴지통 자동 삭제). 짧은 값은 Cron 라우트가 거부한다(다른 기능은 영향 없음).
  CRON_SECRET: optionalString,
  // E2E 전용: "1"이면 Claude 대신 가짜 토론 주제를 돌려준다. 운영 배포(VERCEL_ENV=production)에서는 무시한다.
  AI_FAKE_RESPONSES: optionalString,
  VERCEL_ENV: optionalString,
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

export function parseServerEnv(source: Record<string, string | undefined>): ServerEnv {
  return serverEnvSchema.parse(source);
}

/** 서버 전용 환경변수. 클라이언트 번들에 들어가면 server-only가 빌드를 막는다. */
export function getServerEnv(): ServerEnv {
  return parseServerEnv(process.env);
}
