"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { SettingsProvider, useSettings } from "@/lib/store";
import type { ChatMessage, ProgressEvent, Report, StreamEvent } from "@/lib/types";
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
  context?: string;
  chat: ChatMessage[];
  chatStreaming: boolean;
  error?: string;
  running: boolean;
  discord: DiscordState;
  discordError?: string;
  discordAt?: string;
};

const EXAMPLES = ["Stripe", "Tesla", "https://notion.so", "Figma"];
const CHAT_STARTERS = ["How do they make money?", "Who's their biggest competitor?", "What's their ICP?"];

function App() {
  const { settings, hasAI, hasDiscord } = useSettings();
  const [runs, setRuns] = useState<Run[]>([]);
  const loaded = useRef(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("scout-runs");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          setRuns(parsed.map((r: Run) => (r.running ? { ...r, running: false, error: r.error || "Interrupted" } : r)));
        }
      }
    } catch {}
    loaded.current = true;
  }, []);

  useEffect(() => {
    if (loaded.current) {
      localStorage.setItem("scout-runs", JSON.stringify(runs));
    }
  }, [runs]);
  const [input, setInput] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const lastRun = runs[runs.length - 1];
  const busy = runs.some((r) => r.running) || !!lastRun?.chatStreaming;
  // Once the latest run has a report, the input becomes a follow-up chat box.
  const chatMode = !!lastRun?.report && !lastRun.running;

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
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
        patchRun(id, { discord: "sent", discordAt: data.timestamp });
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
    // Cap in-memory history so a long demo session can't grow unbounded.
    setRuns((prev) => [
      ...prev.slice(-11),
      { id, input: q, events: [], chat: [], chatStreaming: false, running: true, discord: "idle" },
    ]);
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
          } else if (evt.type === "context") {
            patchRun(id, { context: evt.context });
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

  const sendChat = async (question: string) => {
    const q = question.trim();
    if (!q || busy || !lastRun?.report) return;
    const id = lastRun.id;
    const history = lastRun.chat;
    patchRun(id, (r) => ({
      chat: [...r.chat, { role: "user", content: q }, { role: "assistant", content: "" }],
      chatStreaming: true,
    }));
    setInput("");
    scrollToEnd();

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: q,
          // Compact Report JSON as grounding — not the raw crawl text — so
          // follow-up turns stay cheap. The report already holds the facts.
          context: JSON.stringify({
            ...lastRun.report.company,
            competitors: lastRun.report.competitors,
            socials: lastRun.report.socials,
          }),
          company: lastRun.report.company.name,
          history,
          settings,
        }),
      });
      if (!res.body) throw new Error("No response stream");
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      const appendDelta = (delta: string) =>
        patchRun(id, (r) => {
          const chat = [...r.chat];
          const last = chat[chat.length - 1];
          chat[chat.length - 1] = { role: "assistant", content: last.content + delta };
          return { chat };
        });

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const parts = buf.split("\n\n");
        buf = parts.pop() || "";
        for (const part of parts) {
          const line = part.trim();
          if (!line.startsWith("data:")) continue;
          const data = line.slice(5).trim();
          if (!data) continue;
          try {
            const evt = JSON.parse(data);
            if (evt.type === "delta") {
              appendDelta(evt.text);
              scrollToEnd();
            } else if (evt.type === "error") {
              appendDelta(`⚠️ ${evt.message}`);
            }
          } catch {
            // ignore partial
          }
        }
      }
    } catch (err) {
      patchRun(id, (r) => {
        const chat = [...r.chat];
        chat[chat.length - 1] = { role: "assistant", content: `⚠️ ${err instanceof Error ? err.message : "Chat failed"}` };
        return { chat };
      });
    } finally {
      patchRun(id, { chatStreaming: false });
    }
  };

  const onSubmit = () => (chatMode ? sendChat(input) : runResearch(input));

  // In-memory session history (no storage) — jump to any past report.
  const history = runs.filter((r) => r.report).map((r) => ({ id: r.id, label: r.report!.company.name }));
  const selectRun = (id: string) => {
    setSidebarOpen(false);
    document.getElementById(`run-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const empty = runs.length === 0;

  return (
    <div className="flex h-screen overflow-hidden bg-parchment text-ink">
      <main className="relative flex min-w-0 flex-1 flex-col">
        <header className="relative z-10 flex items-center justify-between bg-parchment/80 px-4 py-3 backdrop-blur-xl md:px-6">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen(true)}
              className="press-scale rounded-full p-1.5 text-ink-muted-48 hover:text-ink md:hidden"
              aria-label="Open menu"
            >
              <IconMenu />
            </button>
            <span className="type-tagline text-ink">Company Research</span>
          </div>
          <button
            onClick={() => setSettingsOpen(true)}
            className="press-scale rounded-full p-1.5 text-ink-muted-48 hover:text-ink"
            aria-label="Settings"
          >
            <IconSettings />
          </button>
        </header>

        <div ref={scrollRef} className="flex-1 overflow-y-auto">
          {empty ? (
            <Hero onPick={(v) => runResearch(v)} />
          ) : (
            <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
              {runs.map((run) => (
                <div key={run.id} id={`run-${run.id}`} className="mb-10 scroll-mt-4">
                  <div className="mb-5 flex justify-end">
                    <div className="type-body max-w-[85%] rounded-lg bg-parchment px-4 py-2.5 text-ink">
                      {run.input}
                    </div>
                  </div>
                  <div className="space-y-5">
                    {(run.running || run.events.length > 0) && !run.report && !run.error && (
                      <Pipeline events={run.events} running={run.running} />
                    )}
                    {run.report && (
                      <ReportCard
                        report={run.report}
                        onDownload={() => downloadPdf(run.report!)}
                        onDiscord={() => sendDiscord(run.id, run.report!)}
                        onRegenerate={() => runResearch(run.input)}
                        onReportUpdate={(r) => patchRun(run.id, { report: r })}
                        context={run.context}
                        discordState={run.discord}
                        discordEnabled={hasDiscord}
                        discordError={run.discordError}
                        discordAt={run.discordAt}
                        isNew={run.id === lastRun?.id}
                      />
                    )}
                    {run.chat.length > 0 && <ChatThread messages={run.chat} streaming={run.chatStreaming} />}
                    {run.report && run.chat.length === 0 && run.id === lastRun?.id && !busy && (
                      <div className="flex flex-wrap gap-2">
                        {CHAT_STARTERS.map((s) => (
                          <button
                            key={s}
                            onClick={() => sendChat(s)}
                            className="press-scale type-caption rounded-pill border border-hairline bg-canvas px-3.5 py-2 text-ink-muted-80 transition-colors hover:border-primary/40 hover:text-ink"
                          >
                            {s}
                          </button>
                        ))}
                      </div>
                    )}
                    {run.error && (
                      <div
                        className="animate-fadeup type-body rounded-lg border border-hairline px-5 py-4"
                        style={{ color: "var(--color-danger)" }}
                      >
                        <div className="type-caption-strong mb-1">Research failed</div>
                        {run.error}
                        {run.error.toLowerCase().includes("openrouter") && (
                          <button
                            onClick={() => setSettingsOpen(true)}
                            className="type-caption mt-2 block text-primary hover:underline"
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

        <div className="sticky bottom-0 z-10 border-t border-divider-soft bg-canvas/40 backdrop-blur-2xl saturate-150 p-4 sm:p-6 shadow-sm">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (input.trim()) chatMode ? sendChat(input) : runResearch(input);
            }}
            className="mx-auto flex h-11 w-full max-w-3xl items-center gap-2 rounded-pill border border-hairline bg-canvas/50 px-4 focus-within:border-primary focus-within:ring-4 focus-within:ring-primary/12 transition-all"
          >
            <span className="text-ink-muted-48">
              <IconScan width={17} height={17} />
            </span>
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={busy}
              placeholder={
                chatMode
                  ? `Ask a follow-up about ${lastRun.report!.company.name}…`
                  : "Enter a company name or website URL…"
              }
              className="type-body min-w-0 flex-1 bg-transparent text-ink placeholder:text-ink-muted-48 focus:outline-none disabled:opacity-60"
            />
            <button
              type="submit"
              disabled={busy || !input.trim()}
              className="press-scale type-caption-strong -mr-1 inline-flex min-w-[100px] items-center justify-center gap-1.5 rounded-pill bg-primary px-4 py-2 text-white transition-colors hover:bg-primary-focus disabled:opacity-40"
            >
              {busy ? (
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
              ) : (
                <>
                  {chatMode ? "Ask" : "Research"} <IconArrow width={14} height={14} />
                </>
              )}
            </button>
          </form>
          <p className="type-fine-print mx-auto mt-2.5 max-w-3xl text-center text-ink-muted-48">
            {chatMode ? "Ask anything about this company · New research to start over" : hasAI ? "Ready" : "Add your OpenRouter key in Settings to begin"} · No data stored
          </p>
        </div>
      </main>

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
        history={history}
        onSelect={selectRun}
      />
      <Settings open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}

function ChatThread({ messages, streaming }: { messages: ChatMessage[]; streaming: boolean }) {
  return (
    <div className="space-y-4">
      {messages.map((m, i) => {
        const isLast = i === messages.length - 1;
        if (m.role === "user") {
          return (
            <div key={i} className="flex justify-end">
              <div className="type-body max-w-[85%] rounded-lg bg-parchment px-4 py-2.5 text-ink">{m.content}</div>
            </div>
          );
        }
        return (
          <div key={i} className="type-body max-w-[92%] whitespace-pre-wrap text-ink-muted-80">
            {m.content || (streaming && isLast ? "" : "")}
            {streaming && isLast && <span className="ml-0.5 inline-block h-4 w-[2px] animate-pulse bg-primary align-middle" />}
          </div>
        );
      })}
    </div>
  );
}

function Hero({ onPick }: { onPick: (v: string) => void }) {
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const handleMouseMove = (e: React.MouseEvent) => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const x = (e.clientX / window.innerWidth - 0.5) * 6;
    const y = (e.clientY / window.innerHeight - 0.5) * 6;
    setMousePos({ x, y });
  };

  return (
    <div onMouseMove={handleMouseMove} className="relative mx-auto flex min-h-full w-full max-w-2xl flex-col items-center justify-center px-6 py-16 text-center overflow-visible">
      <div className="absolute inset-0 pointer-events-none opacity-[0.15] bg-[radial-gradient(var(--color-ink)_1px,transparent_1px)] [background-size:24px_24px]" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-primary/10 blur-[100px] rounded-full pointer-events-none" />
      
      <h1 
        className="type-hero text-ink animate-fadeup"
        style={{ transform: `translate(${-mousePos.x}px, ${-mousePos.y}px)`, willChange: "transform" }}
      >
        Research any company
        <br />
        in seconds.
      </h1>
      <p className="type-lead mt-5 max-w-xl text-ink-muted-80 animate-fadeup" style={{ animationDelay: "100ms" }}>
        Enter a company name or website. Scout crawls the site, searches public
        sources, and reasons over it all to build an intelligence dossier.
      </p>
      <div className="mt-9 flex flex-wrap items-center justify-center gap-2 animate-fadeup" style={{ animationDelay: "200ms" }}>
        {EXAMPLES.map((e) => (
          <button
            key={e}
            onClick={() => onPick(e)}
            className="press-scale type-caption rounded-md border-[3px] border-canvas bg-canvas shadow-sm px-3.5 py-2 text-ink-muted-80 transition-all duration-200 hover:-translate-y-[2px] hover:scale-[1.02] hover:border-primary/20"
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
