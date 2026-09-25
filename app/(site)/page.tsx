import { bridgeStages, siteConfig, type BridgeStageKey } from "@/lib/site";
import { cn } from "@/lib/utils";

const stageColor: Record<BridgeStageKey, string> = {
  literacy: "bg-stage-literacy text-stage-literacy-foreground",
  usage: "bg-stage-usage text-stage-usage-foreground",
  coding: "bg-stage-coding text-stage-coding-foreground",
  project: "bg-stage-project text-stage-project-foreground",
};

// 홈 화면 틀. 메뉴 카드·최근 자료·최근 공지는 P4(F-11)에서 채운다.
export default function HomePage() {
  return (
    <div className="container-site flex flex-col gap-12 py-12 sm:py-20">
      <section className="flex flex-col gap-3">
        <h1 className="text-3xl font-bold tracking-tight sm:text-5xl">
          AI Bridge<span className="text-brand">:ON</span>
        </h1>
        <p className="text-lg text-muted-foreground sm:text-xl">{siteConfig.tagline}</p>
      </section>

      <section aria-labelledby="model-heading" className="flex flex-col gap-4">
        <h2 id="model-heading" className="text-xl font-semibold">
          AI Bridge 교육 모델
        </h2>
        <ol className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {bridgeStages.map((stage, index) => (
            <li
              key={stage.key}
              className={cn("flex flex-col gap-1 rounded-xl p-4", stageColor[stage.key])}
            >
              <span className="text-xs font-medium opacity-90">
                {index + 1}단계 · {stage.english}
              </span>
              <span className="text-lg font-bold">{stage.label}</span>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
