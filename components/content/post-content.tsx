import {
  CodeXmlIcon,
  ExternalLinkIcon,
  FileIcon,
  InfoIcon,
  LightbulbIcon,
  LockIcon,
  TriangleAlertIcon,
} from "lucide-react";

import type { Block } from "@/lib/posts/content";
import { parseYouTubeId } from "@/lib/posts/content";
import { buildJudgeUrl } from "@/lib/settings/online-judge";
import { cn } from "@/lib/utils";

import { CodeBlock } from "./code-block";
import { alignClass, colorStyle } from "./colors";
import { Inline, inlinePlainText } from "./inline";

type Ctx = { judgeUrlTemplate: string | null };

const SAFE_URL = /^https?:\/\//i;
const LIST_TYPES = new Set(["bulletListItem", "numberedListItem", "checkListItem"]);

/**
 * 게시물 본문(BlockNote JSON) 읽기 전용 렌더러(F-07). 서버 컴포넌트로 그려 첫 화면이 빠르고,
 * HTML 문자열을 넣지 않는다. 교사 전용 블록은 호출 전에 서버가 이미 뺐다(보는 사람이 교사가 아닐 때).
 */
export function PostContent({
  blocks,
  judgeUrlTemplate,
}: {
  blocks: Block[];
  judgeUrlTemplate: string | null;
}) {
  return (
    <div className="post-content text-base leading-relaxed break-keep">
      <Blocks blocks={blocks} ctx={{ judgeUrlTemplate }} />
    </div>
  );
}

/** 같은 종류의 목록 항목이 이어지면 하나의 ul/ol로 묶는다(BlockNote는 항목을 블록 하나씩 저장한다). */
function Blocks({ blocks, ctx }: { blocks: Block[]; ctx: Ctx }) {
  const out: React.ReactNode[] = [];
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    if (!LIST_TYPES.has(block.type)) {
      out.push(<BlockView key={block.id} block={block} ctx={ctx} />);
      continue;
    }
    const group: Block[] = [block];
    while (i + 1 < blocks.length && blocks[i + 1].type === block.type) group.push(blocks[++i]);
    out.push(<List key={block.id} type={block.type} items={group} ctx={ctx} />);
  }
  return <>{out}</>;
}

function Children({ block, ctx }: { block: Block; ctx: Ctx }) {
  if (!block.children.length) return null;
  return (
    <div className="pl-6">
      <Blocks blocks={block.children} ctx={ctx} />
    </div>
  );
}

function List({ type, items, ctx }: { type: string; items: Block[]; ctx: Ctx }) {
  const li = (item: Block) => (
    <li
      key={item.id}
      className={alignClass(item.props.textAlignment)}
      style={colorStyle(item.props.textColor, item.props.backgroundColor)}
    >
      {type === "checkListItem" ? (
        <span className="flex items-start gap-2">
          <input
            type="checkbox"
            checked={item.props.checked === true}
            readOnly
            disabled
            className="mt-1.5 size-4"
            aria-label={item.props.checked ? "완료" : "미완료"}
          />
          <span className={cn(item.props.checked === true && "text-muted-foreground line-through")}>
            <Inline content={item.content} />
          </span>
        </span>
      ) : (
        <Inline content={item.content} />
      )}
      {item.children.length > 0 && (
        <div className="mt-1">
          <Blocks blocks={item.children} ctx={ctx} />
        </div>
      )}
    </li>
  );
  if (type === "numberedListItem") {
    const start = Number(items[0].props.start);
    return (
      <ol
        className="my-3 list-decimal space-y-1 pl-6"
        start={Number.isInteger(start) && start > 0 ? start : undefined}
      >
        {items.map(li)}
      </ol>
    );
  }
  return (
    <ul className={cn("my-3 space-y-1", type === "checkListItem" ? "list-none" : "list-disc pl-6")}>
      {items.map(li)}
    </ul>
  );
}

const HEADING = {
  // 페이지 제목이 h1이므로 본문 제목은 한 단계씩 내린다.
  1: { Tag: "h2", className: "mt-10 mb-3 text-2xl font-bold" },
  2: { Tag: "h3", className: "mt-8 mb-2 text-xl font-bold" },
  3: { Tag: "h4", className: "mt-6 mb-2 text-lg font-semibold" },
} as const;

const CALLOUT = {
  info: { icon: InfoIcon, className: "border-sky-300 bg-sky-50" },
  tip: { icon: LightbulbIcon, className: "border-emerald-300 bg-emerald-50" },
  warning: { icon: TriangleAlertIcon, className: "border-amber-300 bg-amber-50" },
} as const;

function BlockView({ block, ctx }: { block: Block; ctx: Ctx }) {
  const p = block.props;
  const style = colorStyle(p.textColor, p.backgroundColor);
  const align = alignClass(p.textAlignment);

  switch (block.type) {
    case "paragraph":
      return (
        <>
          <p className={cn("my-3 min-h-[1lh]", align)} style={style}>
            <Inline content={block.content} />
          </p>
          <Children block={block} ctx={ctx} />
        </>
      );

    case "heading": {
      const level = (Number(p.level) in HEADING ? Number(p.level) : 3) as keyof typeof HEADING;
      const { Tag, className } = HEADING[level];
      const heading = (
        <Tag className={cn(className, align)} style={style}>
          <Inline content={block.content} />
        </Tag>
      );
      if (p.isToggleable === true) {
        return (
          <details className="my-2">
            <summary className="cursor-pointer [&>*]:inline">{heading}</summary>
            <Children block={block} ctx={ctx} />
          </details>
        );
      }
      return (
        <>
          {heading}
          <Children block={block} ctx={ctx} />
        </>
      );
    }

    case "quote":
      return (
        <blockquote
          className={cn(
            "my-4 border-l-4 border-muted-foreground/30 pl-4 text-muted-foreground",
            align,
          )}
          style={style}
        >
          <Inline content={block.content} />
          <Children block={block} ctx={ctx} />
        </blockquote>
      );

    case "toggleListItem":
      return (
        <details className="my-2 rounded-md">
          <summary className="cursor-pointer font-medium">
            <Inline content={block.content} />
          </summary>
          <div className="mt-1 pl-6">
            <Blocks blocks={block.children} ctx={ctx} />
          </div>
        </details>
      );

    case "callout": {
      const tone = CALLOUT[p.tone as keyof typeof CALLOUT] ?? CALLOUT.info;
      const Icon = tone.icon;
      return (
        <div
          className={cn(
            "my-4 flex gap-2 rounded-lg border-l-4 px-4 py-3 print:break-inside-avoid",
            tone.className,
          )}
        >
          <Icon className="mt-1 size-4 shrink-0" aria-hidden />
          <div className="min-w-0 flex-1">
            <Inline content={block.content} />
            <Children block={block} ctx={ctx} />
          </div>
        </div>
      );
    }

    case "teacherBox":
      // 여기까지 왔으면 보는 사람이 교사 이상이다(아니면 서버가 이미 뺐다).
      return (
        <section
          aria-label="교사 전용"
          className="my-4 rounded-lg border border-dashed border-violet-400 bg-violet-50/60 px-4 py-3 print:break-inside-avoid"
        >
          <p className="mb-1 inline-flex items-center gap-1 text-xs font-semibold text-violet-800">
            <LockIcon className="size-3.5" aria-hidden />
            교사 전용 · 학생에게는 보이지 않습니다
          </p>
          <p className="font-medium">
            <Inline content={block.content} />
          </p>
          <Blocks blocks={block.children} ctx={ctx} />
        </section>
      );

    case "codeBlock":
      return (
        <CodeBlock
          code={inlinePlainText(block.content)}
          language={typeof p.language === "string" ? p.language : "text"}
        />
      );

    case "divider":
      return <hr className="my-8 border-border" />;

    case "image": {
      const url = typeof p.url === "string" && SAFE_URL.test(p.url) ? p.url : null;
      if (!url) return null;
      const caption = typeof p.caption === "string" ? p.caption : "";
      const width = Number(p.previewWidth);
      return (
        <figure
          className={cn(
            "my-6 print:break-inside-avoid",
            p.textAlignment === "center" && "mx-auto",
            p.textAlignment === "right" && "ml-auto",
          )}
          style={Number.isFinite(width) && width > 0 ? { maxWidth: width } : undefined}
        >
          {/* Storage 공개 주소의 이미지. 크기를 미리 알 수 없어 next/image 대신 img를 쓴다. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={url}
            alt={caption || (typeof p.name === "string" ? p.name : "") || "본문 이미지"}
            loading="lazy"
            className="h-auto max-w-full rounded-lg"
          />
          {caption && (
            <figcaption className="mt-2 text-center text-sm text-muted-foreground">
              {caption}
            </figcaption>
          )}
        </figure>
      );
    }

    case "file": {
      const url = typeof p.url === "string" && SAFE_URL.test(p.url) ? p.url : null;
      if (!url) return null;
      const name = (typeof p.name === "string" && p.name) || "첨부 파일";
      return (
        <p className="my-3">
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            download
            className="inline-flex max-w-full items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium hover:bg-muted"
          >
            <FileIcon className="size-4 shrink-0" aria-hidden />
            <span className="truncate">{name}</span>
          </a>
          {typeof p.caption === "string" && p.caption && (
            <span className="mt-1 block text-sm text-muted-foreground">{p.caption}</span>
          )}
        </p>
      );
    }

    case "youtube": {
      const id = typeof p.videoId === "string" ? parseYouTubeId(p.videoId) : null;
      if (!id) return null;
      const caption = typeof p.caption === "string" ? p.caption : "";
      return (
        <figure className="my-6">
          <div className="relative aspect-video w-full overflow-hidden rounded-lg bg-muted print:hidden">
            <iframe
              className="absolute inset-0 size-full"
              src={`https://www.youtube-nocookie.com/embed/${id}`}
              title={caption || "YouTube 영상"}
              allow="accelerometer; encrypted-media; gyroscope; picture-in-picture"
              referrerPolicy="strict-origin-when-cross-origin"
              allowFullScreen
              loading="lazy"
            />
          </div>
          <p className="hidden text-sm print:block">영상: https://youtu.be/{id}</p>
          {caption && (
            <figcaption className="mt-2 text-center text-sm text-muted-foreground">
              {caption}
            </figcaption>
          )}
        </figure>
      );
    }

    case "judgeLink": {
      const problemId = typeof p.problemId === "string" ? p.problemId : "";
      if (!problemId) return null;
      const label = (typeof p.label === "string" && p.label) || `${problemId}번 문제 풀기`;
      const url = buildJudgeUrl(ctx.judgeUrlTemplate, problemId);
      return (
        <p className="my-4">
          {url ? (
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              <CodeXmlIcon className="size-4" aria-hidden />
              {label}
              <ExternalLinkIcon className="size-3.5" aria-label="새 탭" />
            </a>
          ) : (
            <span
              aria-disabled="true"
              className="inline-flex cursor-not-allowed items-center gap-2 rounded-lg bg-muted px-4 py-2 text-sm font-medium text-muted-foreground"
            >
              <CodeXmlIcon className="size-4" aria-hidden />
              {label} (준비 중)
            </span>
          )}
        </p>
      );
    }

    case "table":
      return <Table content={block.content} />;

    default:
      return null;
  }
}

type TableCell = { type?: string; content?: unknown; props?: Record<string, unknown> } | unknown[];
type TableContent = { rows?: { cells?: TableCell[] }[]; headerRows?: number; headerCols?: number };

function Table({ content }: { content: unknown }) {
  const table = content as TableContent | undefined;
  const rows = Array.isArray(table?.rows) ? table.rows : [];
  if (!rows.length) return null;
  const headerRows = Number(table?.headerRows) || 0;
  const headerCols = Number(table?.headerCols) || 0;
  return (
    <div className="my-6 overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <tbody>
          {rows.map((row, r) => (
            <tr key={r}>
              {(row.cells ?? []).map((cell, c) => {
                const isCellObject = cell && typeof cell === "object" && !Array.isArray(cell);
                const props =
                  (isCellObject
                    ? (cell as { props?: Record<string, unknown> }).props
                    : undefined) ?? {};
                const inline = isCellObject ? (cell as { content?: unknown }).content : cell;
                const Tag = r < headerRows || c < headerCols ? "th" : "td";
                const colSpan = Number(props.colspan) > 1 ? Number(props.colspan) : undefined;
                const rowSpan = Number(props.rowspan) > 1 ? Number(props.rowspan) : undefined;
                return (
                  <Tag
                    key={c}
                    colSpan={colSpan}
                    rowSpan={rowSpan}
                    className={cn(
                      "border px-3 py-2 align-top",
                      Tag === "th" && "bg-muted font-semibold",
                      alignClass(props.textAlignment) || "text-left",
                    )}
                    style={colorStyle(props.textColor, props.backgroundColor)}
                  >
                    <Inline content={inline} />
                  </Tag>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
