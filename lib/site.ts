import { publicEnv } from "@/lib/env";

export const siteConfig = {
  name: "AI Bridge:ON",
  tagline: "이해에서 창작까지, AI 교육을 켜다",
  description:
    "「AI Bridge 모델을 통한 실천적 AI 교육 구축」 연구의 차시별 수업 자료를 공개·운영하는 교육 플랫폼",
} as const;

/** AI Bridge 교육 모델 4단계. 활용(usage) 단계는 별도 메뉴가 없다(D1). */
export const bridgeStages = [
  { key: "literacy", label: "이해", english: "AI LITERACY" },
  { key: "usage", label: "활용", english: "AI USAGE" },
  { key: "coding", label: "구현", english: "AI CODING" },
  { key: "project", label: "창작", english: "AI PROJECT" },
] as const;

export type BridgeStageKey = (typeof bridgeStages)[number]["key"];

/** 절대 URL 생성. 도메인은 NEXT_PUBLIC_SITE_URL로만 참조한다. */
export function absoluteUrl(path = "/"): string {
  return new URL(path, publicEnv.NEXT_PUBLIC_SITE_URL + "/").toString();
}
