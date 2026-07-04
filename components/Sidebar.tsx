"use client";

import { useSettings } from "@/lib/store";
import { IconPlus, IconScan, IconSettings, IconX } from "./icons";

const STEPS = [
  "Enter a company name or URL",
  "Serper resolves the official site",
  "Crawler reads key pages",
  "AI generates insights + rivals",
  "Download the PDF dossier",
];

export default function Sidebar({
  open,
  onClose,
  onNew,
  onOpenSettings,
}: {
  open: boolean;
  onClose: () => void;
  onNew: () => void;
  onOpenSettings: () => void;
}) {
  const { hasAI, hasSearch, hasDiscord } = useSettings();

  return (
    <>
      <div
        onClick={onClose}
        className={`fixed inset-0 z-30 bg-black/50 backdrop-blur-sm md:hidden ${
          open ? "block" : "hidden"
        }`}
      />
      <aside
        className={`fixed z-40 flex h-full w-[264px] flex-col border-r border-line bg-base-2/95 backdrop-blur-md transition-transform duration-300 md:static md:z-0 md:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* Brand */}
        <div className="flex items-center justify-between px-5 py-5">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-signal/30 bg-signal/10 text-signal">
              <IconScan width={19} height={19} />
            </span>
            <div>
              <div className="font-display text-[15px] font-semibold leading-none tracking-tight">
                Scout
              </div>
              <div className="mt-1 font-mono text-[9px] uppercase tracking-[0.2em] text-ink-mute">
                Company Intel
              </div>
            </div>
          </div>
          <button onClick={onClose} className="rounded-lg p-1 text-ink-mute hover:text-ink md:hidden" aria-label="Close menu">
            <IconX />
          </button>
        </div>

        {/* New research */}
        <div className="px-4">
          <button
            onClick={onNew}
            className="flex w-full items-center gap-2 rounded-xl border border-line bg-panel px-3.5 py-2.5 text-sm font-medium text-ink transition hover:border-signal/40 hover:bg-panel/60"
          >
            <IconPlus width={16} height={16} className="text-signal" />
            New research
          </button>
        </div>

        {/* How it works */}
        <div className="mt-7 px-5">
          <div className="mb-3 font-mono text-[10px] uppercase tracking-[0.18em] text-ink-mute">
            How it works
          </div>
          <ol className="space-y-3">
            {STEPS.map((s, i) => (
              <li key={i} className="flex gap-3 text-[13px] text-ink-dim">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md border border-line font-mono text-[10px] text-signal">
                  {i + 1}
                </span>
                <span className="leading-snug">{s}</span>
              </li>
            ))}
          </ol>
        </div>

        <div className="mt-auto space-y-3 px-4 pb-5">
          {/* status */}
          <div className="flex flex-wrap gap-1.5 px-1">
            {([["AI", hasAI], ["Search", hasSearch], ["Discord", hasDiscord]] as [string, boolean][]).map(
              ([l, ok]) => (
                <span
                  key={l}
                  className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider ${
                    ok ? "text-signal" : "text-ink-mute"
                  }`}
                >
                  <span className={`h-1.5 w-1.5 rounded-full ${ok ? "bg-signal" : "bg-line"}`} />
                  {l}
                </span>
              ),
            )}
          </div>
          <button
            onClick={onOpenSettings}
            className="flex w-full items-center gap-2 rounded-xl border border-line px-3.5 py-2.5 text-sm text-ink-dim transition hover:border-signal/40 hover:text-ink"
          >
            <IconSettings width={16} height={16} />
            Settings & API keys
          </button>
        </div>
      </aside>
    </>
  );
}
