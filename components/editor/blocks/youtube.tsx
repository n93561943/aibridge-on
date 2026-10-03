"use client";

import { createReactBlockSpec } from "@blocknote/react";
import { useState } from "react";

import { parseYouTubeId } from "@/lib/posts/content";

/** YouTube 임베드: 영상 ID만 저장하고 youtube-nocookie로 보여 준다. */
export const youtubeBlock = createReactBlockSpec(
  {
    type: "youtube",
    propSchema: {
      videoId: { default: "" },
      caption: { default: "" },
    },
    content: "none",
  },
  {
    render: ({ block, editor }) => {
      const videoId = parseYouTubeId(block.props.videoId);
      if (!videoId) {
        return (
          <YouTubeUrlForm
            readOnly={!editor.isEditable}
            onSubmit={(id) => editor.updateBlock(block, { props: { videoId: id } })}
          />
        );
      }
      return (
        <figure className="w-full" contentEditable={false}>
          <div className="relative aspect-video w-full overflow-hidden rounded-lg bg-muted">
            <iframe
              className="absolute inset-0 size-full"
              src={`https://www.youtube-nocookie.com/embed/${videoId}`}
              title={block.props.caption || "YouTube 영상"}
              allow="accelerometer; encrypted-media; gyroscope; picture-in-picture"
              referrerPolicy="strict-origin-when-cross-origin"
              allowFullScreen
              loading="lazy"
            />
          </div>
          {editor.isEditable ? (
            <input
              className="mt-1 w-full bg-transparent text-center text-sm text-muted-foreground outline-none"
              placeholder="캡션(선택)"
              defaultValue={block.props.caption}
              maxLength={200}
              onBlur={(e) => {
                if (e.target.value !== block.props.caption) {
                  editor.updateBlock(block, { props: { caption: e.target.value } });
                }
              }}
            />
          ) : (
            block.props.caption && (
              <figcaption className="mt-1 text-center text-sm text-muted-foreground">
                {block.props.caption}
              </figcaption>
            )
          )}
        </figure>
      );
    },
  },
);

function YouTubeUrlForm({
  readOnly,
  onSubmit,
}: {
  readOnly: boolean;
  onSubmit: (id: string) => void;
}) {
  const [value, setValue] = useState("");
  const [error, setError] = useState("");
  if (readOnly) return null;
  return (
    <div
      contentEditable={false}
      className="flex w-full flex-col gap-1 rounded-lg border border-dashed p-3"
    >
      <div className="flex flex-wrap gap-2">
        <input
          className="h-9 min-w-0 flex-1 rounded-md border px-2 text-sm"
          placeholder="YouTube 주소를 붙여 넣으세요"
          aria-label="YouTube 주소"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              submit();
            }
          }}
        />
        <button
          type="button"
          className="h-9 rounded-md bg-primary px-3 text-sm text-primary-foreground"
          onClick={submit}
        >
          넣기
        </button>
      </div>
      <p role="alert" className="text-xs text-destructive empty:hidden">
        {error}
      </p>
    </div>
  );

  function submit() {
    const id = parseYouTubeId(value);
    if (!id) setError("YouTube 영상 주소가 아닙니다. 예: https://youtu.be/xxxxxxxxxxx");
    else onSubmit(id);
  }
}
