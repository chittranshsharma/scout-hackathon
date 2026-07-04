"use client";

import type { ProgressEvent, ProgressStage } from "@/lib/types";
import { IconCheck, IconGlobe, IconScan, IconSpark, IconTarget } from "./icons";

const STEPS: { stage: ProgressStage; label: string; Icon: typeof IconScan }[] = [
  { stage: "resolving", label: "Identify company", Icon: IconTarget },
  { stage: "crawling", label: "Crawl website", Icon: IconGlobe },
  { stage: "searching", label: "Search public sources", Icon: IconScan },
  { stage: "analyzing", label: "Generate AI insights", Icon: IconSpark },
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

  // latest detail message per stage
  const detailFor = (stage: ProgressStage) => {
    const matches = events.filter((e) => e.stage === stage);
    return matches.length ? matches[matches.length - 1] : undefined;
  };

  return (
    <div className="rounded-2xl border border-line bg-panel/70 backdrop-blur-sm p-5 sm:p-6">
      <div className="flex items-center gap-2 mb-5">
        <span className="relative flex h-2.5 w-2.5">
          {running && (
            <span className="absolute inline-flex h-full w-full rounded-full bg-signal opacity-60 animate-ping" />
          )}
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-signal" />
        </span>
        <span className="font-mono text-xs tracking-[0.2em] text-signal uppercase">
          {running ? "Research in progress" : "Pipeline complete"}
        </span>
      </div>

      <ol className="relative">
        {STEPS.map((step, i) => {
          const done = currentIdx > i || latestStage === "done";
          const active = currentIdx === i && running && latestStage !== "done";
          const detail = detailFor(step.stage);
          const Icon = step.Icon;
          return (
            <li key={step.stage} className="relative flex gap-4 pb-5 last:pb-0">
              {/* connector */}
              {i < STEPS.length - 1 && (
                <span
                  className="absolute left-[17px] top-9 bottom-0 w-px"
                  style={{ background: done ? "var(--color-signal-dim)" : "var(--color-line)" }}
                />
              )}
              {/* node */}
              <span
                className={[
                  "relative z-10 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border transition-colors",
                  done
                    ? "border-signal bg-signal text-base"
                    : active
                      ? "border-signal bg-signal/10 text-signal node-active"
                      : "border-line bg-base text-ink-mute",
                ].join(" ")}
              >
                {done ? <IconCheck width={16} height={16} /> : <Icon width={16} height={16} />}
              </span>
              {/* text */}
              <div className={active ? "scan-track flex-1 rounded-lg -my-1 py-1 px-1" : "flex-1"}>
                <div
                  className={[
                    "text-sm font-medium",
                    done ? "text-ink" : active ? "text-ink" : "text-ink-mute",
                  ].join(" ")}
                >
                  {step.label}
                </div>
                {detail && (done || active) && (
                  <div className="mt-0.5 font-mono text-[11px] text-ink-dim truncate">
                    {detail.message}
                    {detail.detail ? <span className="text-ink-mute"> · {detail.detail}</span> : null}
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
