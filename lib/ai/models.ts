/**
 * 모델별 요청 방식(P7). ANTHROPIC_MODEL만 바꿔도 요청이 깨지지 않게 한다.
 * - 도구 강제(tool_choice any/tool): Opus 5.5·Sonnet 5.5·Fable 5.1·Mythos 5.1은 400 → auto + 프롬프트 지시 + 호출 확인
 * - temperature: Haiku 4.5·4.6 세대만 허용(Opus 4.7 이후·Sonnet 5 이후는 400)
 * 표에 없는 모델은 둘 다 쓰지 않는다(가장 안전한 요청).
 */
export type ModelCapabilities = { forcedToolChoice: boolean; temperature: boolean };

const CAPABILITIES: Record<string, ModelCapabilities> = {
  "claude-haiku-4-5": { forcedToolChoice: true, temperature: true },
  "claude-sonnet-4-6": { forcedToolChoice: true, temperature: true },
  "claude-opus-4-6": { forcedToolChoice: true, temperature: true },
  "claude-opus-4-7": { forcedToolChoice: true, temperature: false },
  "claude-opus-4-8": { forcedToolChoice: true, temperature: false },
  "claude-opus-5": { forcedToolChoice: true, temperature: false },
  "claude-sonnet-5": { forcedToolChoice: true, temperature: false },
  "claude-opus-5-5": { forcedToolChoice: false, temperature: false },
  "claude-sonnet-5-5": { forcedToolChoice: false, temperature: false },
  "claude-fable-5-1": { forcedToolChoice: false, temperature: false },
};

const SAFE_DEFAULT: ModelCapabilities = { forcedToolChoice: false, temperature: false };

export function modelCapabilities(model: string): ModelCapabilities {
  return CAPABILITIES[model] ?? SAFE_DEFAULT;
}
