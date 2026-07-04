"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { SettingsProvider, useSettings } from "@/lib/store";
import type { ProgressEvent, Report, StreamEvent } from "@/lib/types";
import Sidebar from "@/components/Sidebar";
import Settings from "@/components/Settings";
import Pipeline from "@/components/Pipeline";
import ReportCard from "@/components/ReportCard";
import { IconArrow, IconMenu, IconScan, IconSettings } from "@/components/icons";

type DiscordState = "idle" | "sending" | "sent" | "error";

type Run = {
  id: string;
  input: string;
  events: ProgressEvent[];
  report?: Report;
  error?: string;
  running: boolean;
  discord: DiscordState;
  discordError?: string;
};

const EXAMPLES = ["Stripe", "Tesla", "https://notion.so", "Figma"];

function App() {
  const { settings, hasAI, hasDiscord } = useSettings();
  const [runs, setRuns] = useState<Run[]>([]);
  const [input, setInput] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const busy = runs.some((r) => r.running);

  const scrollToEnd = useCallback(() => {
    requestAnimationFrame(() =>
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" }),
    );
  }, []);

  useEffect(() => {
    scrollToEnd();
  }, [runs, scrollToEnd]);

  const patchRun = (id: string, patch: Partial<Run> | ((r: Run) => Partial<Run>)) =>
    setRuns((prev) =>
      prev.map((r) => (r.id === id ? { ...r, ...(typeof patch === "function" ? patch(r) : patch) } : r)),
    );

  const sendDiscord = useCallback(
    async (id: string, report: Report) => {
      patchRun(id, { discord: "sending" });
      try {
        const res = await fetch("/api/discord", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ report, settings }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || `HTTP ${res.status}`);
        }
        patchRun(id, { discord: "sent" });
      } catch (err) {
        patchRun(id, { discord: "error", discordError: err instanceof Error ? err.message : "failed" });
      }
    },
    [settings],
  );

  const downloadPdf = async (report: Report) => {
    const res = await fetch("/api/pdf", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ report }),
    });
    if (!res.ok) throw new Error("PDF generation failed");
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${report.company.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-research-report.pdf`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const runResearch = async (query: string) => {
    const q = query.trim();
    if (!q || busy) return;
    if (!hasAI && !settings.openrouterKey) {
      setSettingsOpen(true);
      return;
    }
    const id = crypto.randomUUID();
    setRuns((prev) => [...prev, { id, input: q, events: [], running: true, discord: "idle" }]);
    setInput("");

    try {
      const res = await fetch("/api/research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input: q, settings }),
      });
      if (!res.body) throw new Error("No response stream");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const parts = buf.split("\n\n");
        buf = parts.pop() || "";
        for (const part of parts) {
          const line = part.trim();
          if (!line.startsWith("data:")) continue;
          const json = line.slice(5).trim();
          if (!json) continue;
          let evt: StreamEvent;
          try {
            evt = JSON.parse(json);
          } catch {
            continue;
          }
          if (evt.type === "progress") {
            patchRun(id, (r) => ({ events: [...r.events, evt] }));
            scrollToEnd();
          } else if (evt.type === "report") {
            patchRun(id, { report: evt.report, running: false });
            if (hasDiscord) sendDiscord(id, evt.report);
          } else if (evt.type === "error") {
            patchRun(id, { error: evt.message, running: false });
          }
        }
      }
      patchRun(id, { running: false });
    } catch (err) {
      patchRun(id, { error: err instanceof Error ? err.message : "Research failed", running: false });
    }
  };

  const empty = runs.length === 0;

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        onNew={() => {
          setRuns([]);
          setSidebarOpen(false);
        }}
        onOpenSettings={() => {
          setSettingsOpen(true);
          setSidebarOpen(false);
        }}
      />
      <Settings open={settingsOpen} onClose={() => setSettingsOpen(false)} />

      <main className="relative flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-line px-4 py-3 md:px-6">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen(true)}
              className="rounded-lg p-1.5 text-ink-dim hover:bg-panel md:hidden"
              aria-label="Open menu"
            >
              <IconMenu />
            </button>
            <div className="flex items-center gap-2">
              <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-ink-mute">
                Company Research
              </span>
              <span className="hidden items-center gap-1 rounded-full border border-signal/25 bg-signal/10 px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider text-signal sm:inline-flex">
                <span className="h-1.5 w-1.5 rounded-full bg-signal" /> Live
              </span>
            </div>
          </div>
          <button
            onClick={() => setSettingsOpen(true)}
            className="rounded-lg p-1.5 text-ink-dim hover:bg-panel hover:text-ink"
            aria-label="Settings"
          >
            <IconSettings />
          </button>
        </header>

        <div ref={scrollRef} className="flex-1 overflow-y-auto">
          {empty ? (
            <Hero onPick={(v) => runResearch(v)} />
          ) : (
            <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6">
              {runs.map((run) => (
                <div key={run.id} className="mb-8">
                  <div className="mb-4 flex justify-end">
                    <div className="max-w-[85%] rounded-2xl rounded-br-sm border border-line bg-panel px-4 py-2.5 text-sm text-ink">
                      {run.input}
                    </div>
                  </div>
                  <div className="space-y-4">
                    {(run.running || run.events.length > 0) && !run.report && !run.error && (
                      <Pipeline events={run.events} running={run.running} />
                    )}
                    {run.report && (
                      <ReportCard
                        report={run.report}
                        onDownload={() => downloadPdf(run.report!)}
                        onDiscord={() => sendDiscord(run.id, run.report!)}
                        discordState={run.discord}
                        discordEnabled={hasDiscord}
                        discordError={run.discordError}
                      />
                    )}
                    {run.error && (
                      <div className="animate-fadeup rounded-2xl border border-danger/30 bg-danger/5 px-5 py-4 text-sm text-danger">
                        <div className="mb-1 font-mono text-[11px] uppercase tracking-wider">Research failed</div>
                        {run.error}
                        {run.error.toLowerCase().includes("openrouter") && (
                          <button
                            onClick={() => setSettingsOpen(true)}
                            className="mt-2 block font-mono text-xs text-signal underline"
                          >
                            Open settings →
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="border-t border-line bg-base-2/40 px-4 py-4 backdrop-blur-sm md:px-6">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              runResearch(input);
            }}
            className="mx-auto flex w-full max-w-3xl items-center gap-2 rounded-2xl border border-line bg-panel px-2 py-2 focus-within:border-signal/50"
          >
            <span className="pl-2 text-ink-mute">
              <IconScan width={18} height={18} />
            </span>
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={busy}
              placeholder="Enter a company name or website URL…"
              className="min-w-0 flex-1 bg-transparent py-1.5 text-sm text-ink placeholder:text-ink-mute focus:outline-none disabled:opacity-60"
            />
            <button
              type="submit"
              disabled={busy || !input.trim()}
              className="inline-flex items-center gap-1.5 rounded-xl bg-signal px-4 py-2 text-sm font-semibold text-base transition hover:brightness-110 disabled:opacity-40"
            >
              {busy ? (
                <span className="h-4 w-4 animate-spin-slow rounded-full border-2 border-base border-t-transparent" />
              ) : (
                <>
                  Research <IconArrow width={16} height={16} />
                </>
              )}
            </button>
          </form>
          <p className="mx-auto mt-2 max-w-3xl text-center font-mono text-[10px] text-ink-mute">
            {hasAI ? "Ready" : "Add your OpenRouter key in Settings to begin"} · No data stored
          </p>
        </div>
      </main>
    </div>
  );
}

function Hero({ onPick }: { onPick: (v: string) => void }) {
  return (
    <div className="mx-auto flex min-h-full w-full max-w-3xl flex-col items-center justify-center px-6 py-16 text-center">
      <span className="mb-6 inline-flex items-center gap-2 rounded-full border border-signal/25 bg-signal/10 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.2em] text-signal">
        <IconScan width={13} height={13} /> AI intelligence engine
      </span>
      <h1 className="font-display text-4xl font-semibold leading-[1.05] tracking-tight text-ink sm:text-6xl">
        Know any company
        <br />
        <span className="text-signal">in one scan.</span>
      </h1>
      <p className="mt-5 max-w-xl text-[15px] leading-relaxed text-ink-dim">
        Enter a company name or website. Scout crawls the site, searches public
        sources, and reasons over it all to build an intelligence dossier —
        pain points, competitors, and a downloadable PDF.
      </p>
      <div className="mt-8 flex flex-wrap items-center justify-center gap-2">
        <span className="font-mono text-[11px] uppercase tracking-wider text-ink-mute">Try</span>
        {EXAMPLES.map((e) => (
          <button
            key={e}
            onClick={() => onPick(e)}
            className="rounded-lg border border-line bg-panel px-3 py-1.5 font-mono text-xs text-ink-dim transition hover:border-signal/40 hover:text-signal"
          >
            {e}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function Page() {
  return (
    <SettingsProvider>
      <App />
    </SettingsProvider>
  );
}
