"use client";

import type { ProgressEvent, ProgressStage } from "@/lib/types";

const STEPS: { stage: ProgressStage; label: string }[] = [
  { stage: "resolving", label: "Identify" },
  { stage: "crawling", label: "Crawl" },
  { stage: "searching", label: "Search" },
  { stage: "analyzing", label: "Analyze" },
];

const ORDER: ProgressStage[] = ["resolving", "crawling", "searching", "analyzing", "done"];

export default function Pipeline({
  events,
  running,
}: {
  events: ProgressEvent[];
  running: boolean;
}) {
  const latestStage = events.length ? events[events.length - 1].stage : "resolving";
  const currentIdx = ORDER.indexOf(latestStage);
  const fillPct = Math.min(100, (currentIdx / (STEPS.length - 1)) * 100);
  const latest = events[events.length - 1];

  return (
    <div className="py-1">
      <div className="relative h-[3px] w-full overflow-hidden rounded-pill bg-hairline">
        <div
          className="h-full rounded-pill bg-primary transition-[width] duration-400 ease-out"
          style={{ width: `${fillPct}%` }}
        />
      </div>

      <div className="mt-3 flex justify-between">
        {STEPS.map((step, i) => {
          const done = currentIdx > i || latestStage === "done";
          const active = currentIdx === i && running && latestStage !== "done";
          return (
            <span
              key={step.stage}
              className={
                done || active
                  ? "type-caption-strong text-ink"
                  : "type-caption text-ink-muted-48"
              }
            >
              {step.label}
            </span>
          );
        })}
      </div>

      {latest && running && (
        <p key={latest.message} className="type-fine-print animate-fadeup mt-2.5 truncate text-ink-muted-48">
          {latest.message}
          {latest.detail ? <span> · {latest.detail}</span> : null}
        </p>
      )}
    </div>
  );
}
