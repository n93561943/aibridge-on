import { z } from "zod";

/**
 * AI 토론 주제(F-09) 입출력 규칙. 블록 설정·교사 추가 요청 검증, Claude 도구 정의, 응답 검증.
 * 도구 input_schema는 strict 모드가 지원하는 기능(타입·enum·required·additionalProperties: false)만 쓰고,
 * 길이·개수 제한은 zod로 서버에서 다시 검사한다.
 */

export const LEVELS = ["초등", "중등", "고등"] as const;
export const FORMATS = ["찬반", "자유", "가치판단"] as const;
export const DIFFICULTIES = ["쉬움", "보통", "어려움"] as const;

/** 관리자가 블록에 지정하는 설정(BlockNote props는 문자열·숫자로 저장된다) */
export const blockSettingsSchema = z.object({
  keywords: z.string().trim().max(200).catch("").default(""),
  level: z.enum(LEVELS),
  count: z.coerce.number().int().min(3).max(5),
  format: z.enum(FORMATS),
});
export type BlockSettings = z.infer<typeof blockSettingsSchema>;

export const EXTRA_REQUEST_MAX = 200;
export const extraRequestSchema = z
  .string()
  .max(1000)
  .optional()
  .transform((v) => (v ?? "").replace(/\s+/g, " ").trim().slice(0, EXTRA_REQUEST_MAX));

/** 차시 본문 평문 중 AI에 넘기는 최대 글자 수(SPEC) */
export const LESSON_TEXT_MAX = 4000;

export const topicSchema = z.object({
  // 프롬프트는 50자 이내를 요구하지만, 조금 넘는 것으로 재시도(비용)하지 않게 넉넉히 받는다.
  title: z.string().trim().min(1).max(100),
  context: z.string().trim().min(1).max(600),
  pro: z.string().trim().min(1).max(400),
  con: z.string().trim().min(1).max(400),
  question: z.string().trim().min(1).max(300),
  difficulty: z.enum(DIFFICULTIES),
});
export type DiscussionTopic = z.infer<typeof topicSchema>;

export const discussionOutputSchema = z.object({
  topics: z.array(topicSchema).max(5),
  refused: z.string().trim().max(300).nullish(),
});
export type DiscussionOutput = z.infer<typeof discussionOutputSchema>;

export type ValidatedOutput =
  | { kind: "topics"; topics: DiscussionTopic[] }
  | { kind: "refused"; reason: string }
  | { kind: "invalid" };

/** 도구 입력 검증: 거절이면 refused, 주제 개수가 설정과 다르면 invalid */
export function validateDiscussionOutput(raw: unknown, expectedCount: number): ValidatedOutput {
  const parsed = discussionOutputSchema.safeParse(raw);
  if (!parsed.success) return { kind: "invalid" };
  if (parsed.data.refused) return { kind: "refused", reason: parsed.data.refused };
  if (parsed.data.topics.length !== expectedCount) return { kind: "invalid" };
  return { kind: "topics", topics: parsed.data.topics };
}

export const DISCUSSION_TOOL_NAME = "create_discussion_topics";

const str = (description: string) => ({ type: "string", description });

/** Claude 도구 정의(strict). 필드 설명은 모델이 읽는 지시이기도 하다. */
export const discussionTool = {
  name: DISCUSSION_TOOL_NAME,
  description:
    "차시 내용을 바탕으로 만든 토론 주제를 제출한다. 부적절한 요청이면 topics를 빈 배열로 두고 refused에 사유를 쓴다.",
  strict: true,
  input_schema: {
    type: "object" as const,
    properties: {
      topics: {
        type: "array",
        description: "요청한 개수만큼의 토론 주제",
        items: {
          type: "object",
          properties: {
            title: str("토론 주제. 한 문장, 50자 이내"),
            context: str("배경 설명 2~3문장. 차시 내용과 연결"),
            pro: str("찬성(또는 관점 A) 근거 1~2문장"),
            con: str("반대(또는 관점 B) 근거 1~2문장"),
            question: str("학생에게 던질 생각 질문 한 문장"),
            difficulty: { type: "string", enum: [...DIFFICULTIES] },
          },
          required: ["title", "context", "pro", "con", "question", "difficulty"],
          additionalProperties: false,
        },
      },
      refused: {
        anyOf: [{ type: "string" }, { type: "null" }],
        description: "거절한 경우 사유, 아니면 null",
      },
    },
    required: ["topics", "refused"],
    additionalProperties: false,
  },
};
