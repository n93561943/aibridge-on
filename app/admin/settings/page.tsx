import type { Metadata } from "next";

import { requireAdmin } from "@/lib/auth/current-user";
import {
  getAiSettings,
  getBoardUploadDailyLimit,
  getHomeHeroText,
  getOnlineJudgeTemplate,
} from "@/lib/settings/queries";
import { siteConfig } from "@/lib/site";

import { SettingsForm } from "./settings-form";

export const metadata: Metadata = { title: "설정" };

/** 사이트 설정: 홈 문구, 온라인 저지, 게시판 업로드 한도, AI 토론 주제(켜기·예산·환율·일일 한도) */
export default async function SettingsPage() {
  await requireAdmin("/admin/settings");
  const [homeHeroText, onlineJudgeUrl, boardUploadLimit, ai] = await Promise.all([
    getHomeHeroText(),
    getOnlineJudgeTemplate(),
    getBoardUploadDailyLimit(),
    getAiSettings(),
  ]);
  return (
    <div className="container-site flex max-w-2xl flex-col gap-6 py-8">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold">설정</h1>
        <p className="text-sm text-muted-foreground">저장하면 사이트에 바로 반영됩니다.</p>
      </header>
      <SettingsForm
        homeHeroText={homeHeroText ?? ""}
        onlineJudgeUrl={onlineJudgeUrl ?? ""}
        // 설정이 없으면 DB 함수(board_upload_daily_limit)도 마이그레이션 기본값 30을 쓴다.
        boardUploadLimit={boardUploadLimit ?? 30}
        ai={ai}
        defaultTagline={siteConfig.tagline}
      />
    </div>
  );
}
