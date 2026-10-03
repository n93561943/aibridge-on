import type { Metadata } from "next";

import { requireAdmin } from "@/lib/auth/current-user";
import { getHomeHeroText, getOnlineJudgeTemplate } from "@/lib/settings/queries";
import { siteConfig } from "@/lib/site";

import { SettingsForm } from "./settings-form";

export const metadata: Metadata = { title: "설정" };

/** 사이트 설정(최소판). AI 설정·예산은 P7에서 추가한다. */
export default async function SettingsPage() {
  await requireAdmin("/admin/settings");
  const [homeHeroText, onlineJudgeUrl] = await Promise.all([
    getHomeHeroText(),
    getOnlineJudgeTemplate(),
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
        defaultTagline={siteConfig.tagline}
      />
    </div>
  );
}
