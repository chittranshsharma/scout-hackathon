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
  history,
  onSelect,
}: {
  open: boolean;
  onClose: () => void;
  onNew: () => void;
  onOpenSettings: () => void;
  history: { id: string; label: string }[];
  onSelect: (id: string) => void;
}) {
  const { hasAI, hasSearch, hasDiscord } = useSettings();

  return (
    <>
      <div
        onClick={onClose}
        className={`fixed inset-0 z-30 bg-black/50 md:hidden ${open ? "block" : "hidden"}`}
      />
      <aside
        className={`fixed z-40 flex h-full w-[264px] flex-col overflow-y-auto bg-tile-1 transition-transform duration-300 md:static md:z-0 md:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* Brand */}
        <div className="flex items-center justify-between px-5 py-5">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white">
              <IconScan width={18} height={18} />
            </span>
            <span className="type-tagline text-white">Scout</span>
          </div>
          <button onClick={onClose} className="rounded-sm p-1 text-body-muted hover:text-white md:hidden" aria-label="Close menu">
            <IconX />
          </button>
        </div>

        {/* New research */}
        <div className="px-4">
          <button
            onClick={onNew}
            className="press-scale flex w-full items-center justify-center gap-2 rounded-pill bg-primary px-[22px] py-[11px] text-white transition-colors hover:bg-primary-focus"
          >
            <IconPlus width={16} height={16} />
            <span className="type-body">New research</span>
          </button>
        </div>

        {/* Recent research (in-memory, this session) */}
        {history.length > 0 && (
          <div className="mt-7 px-5">
            <div className="type-caption-strong mb-2.5 text-body-muted">Recent</div>
            <ul className="space-y-0.5">
              {history.slice().reverse().map((h) => (
                <li key={h.id}>
                  <button
                    onClick={() => onSelect(h.id)}
                    className="press-scale type-caption block w-full truncate rounded-sm px-2 py-1.5 text-left text-body-muted transition-colors hover:bg-white/[0.06] hover:text-white"
                    title={h.label}
                  >
                    {h.label}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* How it works */}
        <div className="mt-7 px-5">
          <div className="type-caption-strong mb-3 text-body-muted">How it works</div>
          <ol className="space-y-3.5">
            {STEPS.map((s, i) => (
              <li key={i} className="flex gap-3">
                <span className="type-caption flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/10 text-white">
                  {i + 1}
                </span>
                <span className="type-caption leading-snug text-body-muted">{s}</span>
              </li>
            ))}
          </ol>
        </div>

        <div className="mt-auto space-y-3 px-4 pb-5">
          <div className="flex flex-wrap gap-x-3 gap-y-1 px-1">
            {([["AI", hasAI], ["Search", hasSearch], ["Discord", hasDiscord]] as [string, boolean][]).map(
              ([l, ok]) => (
                <span key={l} className="type-fine-print inline-flex items-center gap-1.5 text-body-muted">
                  <span
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ background: ok ? "var(--color-primary-on-dark)" : "#4a4a4c" }}
                  />
                  {l}
                </span>
              ),
            )}
          </div>
          <button
            onClick={onOpenSettings}
            className="press-scale flex w-full items-center gap-2 rounded-sm bg-white/[0.06] px-[15px] py-2 text-white transition-colors hover:bg-white/10"
          >
            <IconSettings width={16} height={16} />
            <span className="type-button-utility">Settings & API keys</span>
          </button>
        </div>
      </aside>
    </>
  );
}
