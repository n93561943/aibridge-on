import "server-only";

import { createHash } from "node:crypto";

import Anthropic from "@anthropic-ai/sdk";

import { getCurrentUser } from "@/lib/auth/current-user";
import { toUserRole } from "@/lib/auth/roles";
import { getServerEnv } from "@/lib/env.server";
import type { Block } from "@/lib/posts/content";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/types/database";

import {
  type DiscussionDeps,
  generateDiscussion,
  type GenerateResult,
  ModelCallError,
  type ModelResult,
  type ReserveStatus,
} from "./discussion";
import { type BlockSettings, DISCUSSION_TOOL_NAME, discussionTool } from "./discussion-schema";
import { modelCapabilities } from "./models";
import { DISCUSSION_SYSTEM_PROMPT } from "./prompts/discussion";
import { AI_SETTING_DEFAULTS, AI_SETTING_KEYS } from "./settings";

/*
 * AI 토론 주제 생성의 서버 구현(Claude API 호출은 lib/ai/에서만 — CLAUDE.md).
 * - 예약은 교사 세션(RLS·DB 권한 검사), 완료 기록은 service role(회원이 비용·결과를 위조하지 못하게)
 * - 본문은 DB에서 직접 읽고, 교사 전용 박스가 빠진 평문(content_text)만 쓴다.
 */

/**
 * 출력 한도. SPEC은 1500이었지만 한국어 실측(2026-10-04, Haiku 4.5)에서 주제 3~5개가
 * 출력 1,311~1,947토큰이라 잘리지 않게 3000으로 올렸다(사용자 결정). 비용은 실제 사용 토큰만 낸다.
 * temperature 0.8은 지원하는 모델에만 보낸다.
 */
export const DISCUSSION_MAX_TOKENS = 3000;
const TEMPERATURE = 0.8;

/** 블록을 찾는다(하위 블록 포함). */
function findBlock(blocks: Block[], id: string): Block | null {
  for (const block of blocks) {
    if (block.id === id) return block;
    const found = Array.isArray(block.children) ? findBlock(block.children, id) : null;
    if (found) return found;
  }
  return null;
}

async function loadLesson(postId: string, blockId: string) {
  const { data } = await createAdminClient()
    .from("posts")
    .select("title, lesson_no, content, content_text")
    .eq("id", postId)
    .eq("status", "published")
    .is("deleted_at", null)
    .is("hidden_at", null)
    .maybeSingle();
  if (!data) return null;
  const block = findBlock((data.content ?? []) as unknown as Block[], blockId);
  if (!block || block.type !== "aiDiscussion") return null;
  return {
    lesson: { title: data.title, lessonNo: data.lesson_no, text: data.content_text ?? "" },
    settings: block.props,
  };
}

/** SDK 오류 → 안내 종류 */
function toModelError(error: unknown): ModelCallError {
  if (error instanceof Anthropic.RateLimitError) return new ModelCallError("rate_limited");
  if (error instanceof Anthropic.APIConnectionTimeoutError) return new ModelCallError("timeout");
  if (error instanceof Anthropic.InternalServerError) return new ModelCallError("overloaded");
  if (error instanceof Anthropic.APIError) {
    return new ModelCallError(error.status === 529 ? "overloaded" : "api_error", error.message);
  }
  return new ModelCallError("api_error", error instanceof Error ? error.message : undefined);
}

function claudeCaller(apiKey: string, model: string) {
  // 실측 응답 12~20초. 수업 중이라 무한정 기다리게 하지 않되 여유를 둔다: 45초, SDK 재시도 1회
  // (응답 검증 재시도는 별도)
  const client = new Anthropic({ apiKey, timeout: 45_000, maxRetries: 1 });
  const capabilities = modelCapabilities(model);
  return async ({ userMessage }: { userMessage: string }): Promise<ModelResult> => {
    let response: Anthropic.Message;
    try {
      response = await client.messages.create({
        model,
        max_tokens: DISCUSSION_MAX_TOKENS,
        system: DISCUSSION_SYSTEM_PROMPT,
        messages: [{ role: "user", content: userMessage }],
        tools: [discussionTool],
        // 최신 모델은 도구 강제가 400이라 auto + 프롬프트 지시 + 호출 여부 확인(없으면 재시도)
        tool_choice: capabilities.forcedToolChoice
          ? { type: "tool", name: DISCUSSION_TOOL_NAME }
          : { type: "auto" },
        ...(capabilities.temperature ? { temperature: TEMPERATURE } : {}),
      });
    } catch (error) {
      throw toModelError(error);
    }
    const toolUse = response.content.find(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use" && b.name === DISCUSSION_TOOL_NAME,
    );
    return {
      // max_tokens로 잘린 입력은 불완전하므로 쓰지 않는다(검증 실패 → 재시도)
      toolInput: response.stop_reason === "max_tokens" ? null : (toolUse?.input ?? null),
      stopReason: response.stop_reason,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    };
  };
}

/**
 * E2E용 가짜 응답(AI_FAKE_RESPONSES=1, 운영 배포 제외). 추가 요청에 [fake:refuse]·[fake:invalid]·
 * [fake:error]를 넣으면 거절·잘못된 응답·API 오류를 흉내 낸다.
 */
function fakeCaller() {
  return async ({
    userMessage,
    settings,
  }: {
    userMessage: string;
    settings: BlockSettings;
  }): Promise<ModelResult> => {
    if (userMessage.includes("[fake:error]")) throw new ModelCallError("api_error");
    const usage = { stopReason: "tool_use", inputTokens: 3000, outputTokens: 1000 };
    if (userMessage.includes("[fake:refuse]")) {
      return { toolInput: { topics: [], refused: "테스트 거절" }, ...usage };
    }
    if (userMessage.includes("[fake:invalid]")) return { toolInput: { topics: [] }, ...usage };
    const topics = Array.from({ length: settings.count }, (_, i) => ({
      title: `가짜 토론 주제 ${i + 1}`,
      context: "E2E 테스트용 배경 설명입니다.",
      pro: "찬성 근거입니다.",
      con: "반대 근거입니다.",
      question: `생각해 볼 질문 ${i + 1}`,
      difficulty: (["쉬움", "보통", "어려움"] as const)[i % 3],
    }));
    return { toolInput: { topics, refused: null }, ...usage };
  };
}

function serverDeps(): DiscussionDeps | null {
  const env = getServerEnv();
  const fake = env.AI_FAKE_RESPONSES === "1" && env.VERCEL_ENV !== "production";
  if (!fake && !env.ANTHROPIC_API_KEY) return null;
  const model = env.ANTHROPIC_MODEL;

  return {
    model,
    prices: {
      inputUsdPerMtok: env.AI_PRICE_INPUT_USD_PER_MTOK,
      outputUsdPerMtok: env.AI_PRICE_OUTPUT_USD_PER_MTOK,
    },
    async getViewer() {
      const user = await getCurrentUser();
      if (!user?.profile) return null;
      return {
        userId: user.id,
        role: toUserRole(user.profile.role),
        active: user.profile.status === "active",
      };
    },
    loadLesson,
    async reserve({ postId, blockId, sourceHash, input, model: reserveModel }) {
      const supabase = await createClient();
      const { data, error } = await supabase.rpc("ai_reserve_generation", {
        p_post_id: postId,
        p_block_id: blockId,
        p_source_hash: sourceHash,
        p_input: input as Json,
        p_model: reserveModel,
      });
      const row = data?.[0];
      if (error || !row) throw new Error(`AI 예약 실패: ${error?.message ?? "응답 없음"}`);
      return {
        status: row.status as ReserveStatus,
        generationId: row.generation_id,
        output: row.output,
      };
    },
    async finish(args) {
      const { error } = await createAdminClient().rpc("ai_finish_generation", {
        p_id: args.generationId,
        p_status: args.status,
        p_output: (args.output ?? null) as Json,
        p_input_tokens: args.inputTokens,
        p_output_tokens: args.outputTokens,
        p_cost_krw: args.costKrw,
        p_model: model,
        // 생성된 RPC 타입은 null을 모르지만 DB 함수는 null(오류 없음)을 받는다.
        p_error_code: args.errorCode as string,
      });
      // 기록 실패는 사용자 결과를 막지 않는다(5분 뒤 stale로 정리됨). 비용 누락은 로그로 남긴다.
      if (error) console.error("AI 생성 완료 기록 실패", args.generationId, error.message);
    },
    callModel: fake ? fakeCaller() : claudeCaller(env.ANTHROPIC_API_KEY!, model),
    async getUsdKrwRate() {
      const { data } = await createAdminClient()
        .from("site_settings")
        .select("value")
        .eq("key", AI_SETTING_KEYS.usdKrwRate)
        .maybeSingle();
      return typeof data?.value === "number" ? data.value : AI_SETTING_DEFAULTS.usdKrwRate;
    },
    hash: (text) => createHash("sha256").update(text).digest("hex"),
  };
}

/** 토론 주제 생성(서버 진입점). API 키가 없으면 "꺼짐"으로 안내한다. */
export async function generateDiscussionOnServer(request: {
  postId: unknown;
  blockId: unknown;
  extraRequest?: unknown;
}): Promise<GenerateResult> {
  const deps = serverDeps();
  if (!deps) {
    return {
      ok: false,
      code: "disabled",
      status: 503,
      message: "AI 기능이 설정되지 않았습니다(관리자: ANTHROPIC_API_KEY 확인).",
    };
  }
  try {
    return await generateDiscussion(request, deps);
  } catch (error) {
    console.error("AI 토론 주제 생성 오류", error);
    return {
      ok: false,
      code: "api_error",
      status: 500,
      message: "처리 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.",
    };
  }
}
