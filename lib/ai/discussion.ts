import type { UserRole } from "@/lib/auth/roles";

import { costKrw } from "./cost";
import {
  blockSettingsSchema,
  type BlockSettings,
  type DiscussionTopic,
  extraRequestSchema,
  validateDiscussionOutput,
} from "./discussion-schema";
import { buildDiscussionUserMessage, type LessonContext } from "./prompts/discussion";

/*
 * AI 토론 주제 생성 흐름(F-09 "처리 흐름"). 실제 DB·Claude 호출은 deps로 받아 단위 테스트한다
 * (서버 구현: lib/ai/discussion-server.ts).
 *
 * 1. 권한: 로그인 + 활동 중인 교사·관리자(화면·서버) → DB 예약 함수가 다시 검사
 * 2. 입력: postId·blockId로 DB에서 본문·블록 설정을 직접 읽는다(클라이언트가 보낸 본문은 믿지 않는다)
 * 3. 예약: AI 켜짐·10분 중복·진행 중·일일 한도·월 예산(DB, 회원별 잠금)
 * 4. Claude 호출 → zod 검증, 실패하면 1회 재시도
 * 5. 결과·토큰·비용 기록(서버 전용 완료 함수)
 */

export type ReserveStatus =
  "ok" | "reused" | "forbidden" | "disabled" | "no_block" | "busy" | "daily_limit" | "budget";

export type ModelResult = {
  /** 도구 호출 입력(JSON). 도구를 부르지 않았으면 null */
  toolInput: unknown;
  stopReason: string | null;
  inputTokens: number;
  outputTokens: number;
};

export type ModelErrorKind = "rate_limited" | "overloaded" | "timeout" | "api_error";

/** Claude 호출 실패(서버 구현이 SDK 오류를 이 종류로 바꿔 던진다) */
export class ModelCallError extends Error {
  constructor(
    readonly kind: ModelErrorKind,
    message?: string,
  ) {
    super(message ?? kind);
  }
}

export type DiscussionDeps = {
  model: string;
  prices: { inputUsdPerMtok: number; outputUsdPerMtok: number };
  getViewer(): Promise<{ userId: string; role: UserRole; active: boolean } | null>;
  /** 공개 글의 그 블록 설정과 차시 맥락. 글·블록이 없으면 null */
  loadLesson(
    postId: string,
    blockId: string,
  ): Promise<{ lesson: LessonContext; settings: unknown } | null>;
  reserve(args: {
    postId: string;
    blockId: string;
    sourceHash: string;
    input: Record<string, unknown>;
    model: string;
  }): Promise<{ status: ReserveStatus; generationId: string | null; output: unknown }>;
  finish(args: {
    generationId: string;
    status: "success" | "failed" | "blocked";
    output: unknown;
    inputTokens: number;
    outputTokens: number;
    costKrw: number;
    errorCode: string | null;
  }): Promise<void>;
  callModel(args: { userMessage: string; settings: BlockSettings }): Promise<ModelResult>;
  getUsdKrwRate(): Promise<number>;
  hash(text: string): string;
};

export type GenerateErrorCode =
  | "unauthenticated"
  | "forbidden"
  | "invalid_request"
  | "not_found"
  | "invalid_block"
  | "no_source"
  | "disabled"
  | "busy"
  | "daily_limit"
  | "budget"
  | "refused"
  | "invalid_output"
  | "rate_limited"
  | "api_error";

export type GenerateResult =
  | { ok: true; generationId: string; topics: DiscussionTopic[]; reused: boolean }
  | { ok: false; code: GenerateErrorCode; message: string; status: number };

/** 상황마다 다른 안내(SPEC: 예산 초과·한도 초과·API 오류는 각각 다른 메시지) */
export const GENERATE_ERRORS: Record<GenerateErrorCode, { status: number; message: string }> = {
  unauthenticated: { status: 401, message: "로그인해 주세요." },
  forbidden: { status: 403, message: "토론 주제는 승인된 교사와 관리자만 만들 수 있습니다." },
  invalid_request: { status: 400, message: "잘못된 요청입니다." },
  not_found: { status: 404, message: "토론 주제 블록을 찾을 수 없습니다. 새로고침해 주세요." },
  invalid_block: {
    status: 400,
    message:
      "블록 설정(대상 수준·주제 개수·토론 형식)이 올바르지 않습니다. 관리자에게 알려 주세요.",
  },
  no_source: { status: 400, message: "차시 본문이나 키워드가 있어야 생성할 수 있습니다." },
  disabled: { status: 503, message: "지금은 AI 토론 주제 기능이 꺼져 있습니다." },
  busy: { status: 409, message: "이 블록에서 이미 만들고 있습니다. 잠시만 기다려 주세요." },
  daily_limit: {
    status: 429,
    message: "오늘 만들 수 있는 횟수를 모두 썼습니다. 내일 다시 이용해 주세요.",
  },
  budget: {
    status: 429,
    message: "이번 달 AI 사용 예산을 모두 써서 생성이 멈췄습니다. 관리자에게 문의해 주세요.",
  },
  refused: {
    status: 422,
    message: "요청 내용으로는 토론 주제를 만들 수 없습니다. 추가 요청을 바꿔 다시 시도해 주세요.",
  },
  invalid_output: {
    status: 502,
    message: "AI 응답을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.",
  },
  rate_limited: {
    status: 503,
    message: "AI 서비스 요청이 많습니다. 1분쯤 뒤에 다시 시도해 주세요.",
  },
  api_error: {
    status: 502,
    message: "AI 서비스에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.",
  },
};

function fail(code: GenerateErrorCode, message?: string): GenerateResult {
  return {
    ok: false,
    code,
    status: GENERATE_ERRORS[code].status,
    message: message ?? GENERATE_ERRORS[code].message,
  };
}

const RESERVE_ERRORS: Partial<Record<ReserveStatus, GenerateErrorCode>> = {
  forbidden: "forbidden",
  disabled: "disabled",
  no_block: "not_found",
  busy: "busy",
  daily_limit: "daily_limit",
  budget: "budget",
};

const ID = /^[A-Za-z0-9_-]{1,100}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** 같은 요청 판단용 해시 재료(본문·설정·추가 요청) */
export function sourceKey(
  lesson: LessonContext,
  settings: BlockSettings,
  extraRequest: string,
): string {
  return JSON.stringify([
    lesson.title,
    lesson.lessonNo,
    lesson.text,
    settings.keywords,
    settings.level,
    settings.count,
    settings.format,
    extraRequest,
  ]);
}

/** 한 번 생성할 때 Claude를 부르는 최대 횟수(처음 + 응답 검증 실패 시 재시도 1회) */
export const MAX_ATTEMPTS = 2;

export async function generateDiscussion(
  request: { postId: unknown; blockId: unknown; extraRequest?: unknown },
  deps: DiscussionDeps,
): Promise<GenerateResult> {
  // 1. 권한
  const viewer = await deps.getViewer();
  if (!viewer) return fail("unauthenticated");
  if (!viewer.active || (viewer.role !== "teacher" && viewer.role !== "admin")) {
    return fail("forbidden");
  }

  // 2. 입력
  if (typeof request.postId !== "string" || !UUID.test(request.postId)) {
    return fail("invalid_request");
  }
  if (typeof request.blockId !== "string" || !ID.test(request.blockId)) {
    return fail("invalid_request");
  }
  const extra = extraRequestSchema.safeParse(
    typeof request.extraRequest === "string" ? request.extraRequest : undefined,
  );
  if (!extra.success) return fail("invalid_request");

  const loaded = await deps.loadLesson(request.postId, request.blockId);
  if (!loaded) return fail("not_found");
  const settings = blockSettingsSchema.safeParse(loaded.settings);
  if (!settings.success) return fail("invalid_block");
  if (!loaded.lesson.text.trim() && !settings.data.keywords) return fail("no_source");

  // 3. 예약
  const userMessage = buildDiscussionUserMessage(loaded.lesson, settings.data, extra.data);
  const reserved = await deps.reserve({
    postId: request.postId,
    blockId: request.blockId,
    sourceHash: deps.hash(sourceKey(loaded.lesson, settings.data, extra.data)),
    input: { ...settings.data, extraRequest: extra.data },
    model: deps.model,
  });
  if (reserved.status === "reused" && reserved.generationId) {
    const previous = validateDiscussionOutput(reserved.output, settings.data.count);
    if (previous.kind === "topics") {
      return {
        ok: true,
        generationId: reserved.generationId,
        topics: previous.topics,
        reused: true,
      };
    }
    return fail("invalid_output");
  }
  const reserveError = RESERVE_ERRORS[reserved.status];
  if (reserveError || !reserved.generationId) return fail(reserveError ?? "api_error");
  const generationId = reserved.generationId;

  // 4. 호출·검증(검증 실패 시 1회 재시도). 토큰은 시도마다 더한다.
  let inputTokens = 0;
  let outputTokens = 0;
  const finish = async (
    status: "success" | "failed" | "blocked",
    output: unknown,
    errorCode: string | null,
  ) => {
    const rate = await deps.getUsdKrwRate();
    await deps.finish({
      generationId,
      status,
      output,
      inputTokens,
      outputTokens,
      costKrw: costKrw({ inputTokens, outputTokens }, deps.prices, rate),
      errorCode,
    });
  };

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    let result: ModelResult;
    try {
      result = await deps.callModel({ userMessage, settings: settings.data });
    } catch (error) {
      const kind = error instanceof ModelCallError ? error.kind : "api_error";
      await finish("failed", null, kind);
      return fail(kind === "rate_limited" || kind === "overloaded" ? "rate_limited" : "api_error");
    }
    inputTokens += result.inputTokens;
    outputTokens += result.outputTokens;

    // 안전 분류기가 거절(stop_reason refusal)하면 재시도하지 않는다.
    if (result.stopReason === "refusal") {
      await finish("blocked", null, "refusal");
      return fail("refused");
    }
    const validated = validateDiscussionOutput(result.toolInput, settings.data.count);
    if (validated.kind === "topics") {
      await finish("success", { topics: validated.topics }, null);
      return { ok: true, generationId, topics: validated.topics, reused: false };
    }
    if (validated.kind === "refused") {
      await finish("blocked", { refused: validated.reason }, "refused");
      return fail("refused");
    }
  }
  await finish("failed", null, "invalid_output");
  return fail("invalid_output");
}
