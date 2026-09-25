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
  ANTHROPIC_MODEL: z.string().default("claude-haiku-4-5"),
  AI_PRICE_INPUT_USD_PER_MTOK: z.coerce.number().nonnegative().default(1),
  AI_PRICE_OUTPUT_USD_PER_MTOK: z.coerce.number().nonnegative().default(5),
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
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

export function parseServerEnv(source: Record<string, string | undefined>): ServerEnv {
  return serverEnvSchema.parse(source);
}

/** 서버 전용 환경변수. 클라이언트 번들에 들어가면 server-only가 빌드를 막는다. */
export function getServerEnv(): ServerEnv {
  return parseServerEnv(process.env);
}
