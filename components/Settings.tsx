"use client";

import { useState } from "react";
import { useSettings } from "@/lib/store";
import { MODEL_OPTIONS } from "@/lib/types";
import { IconCheck, IconDiscord, IconSettings, IconX } from "./icons";

function Labeled({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block font-mono text-[11px] uppercase tracking-wider text-ink-dim">
        {label}
      </span>
      {children}
      {hint && <span className="mt-1 block text-[11px] text-ink-mute">{hint}</span>}
    </label>
  );
}

const inputCls =
  "w-full rounded-lg border border-line bg-base px-3 py-2.5 text-sm text-ink placeholder:text-ink-mute focus:border-signal focus:outline-none";

export default function Settings({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { settings, update, hasAI, hasSearch, hasDiscord } = useSettings();
  const [tab, setTab] = useState<"config" | "discord">("config");
  const [saved, setSaved] = useState(false);
  const [customModel, setCustomModel] = useState(
    settings.model && !MODEL_OPTIONS.some((m) => m.id === settings.model) ? settings.model : "",
  );

  const flashSaved = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 1600);
  };

  return (
    <>
      {/* scrim */}
      <div
        onClick={onClose}
        className={`fixed inset-0 z-40 bg-black/50 backdrop-blur-sm transition-opacity ${
          open ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      />
      {/* panel */}
      <aside
        className={`fixed right-0 top-0 z-50 flex h-full w-full max-w-md flex-col border-l border-line bg-base-2 shadow-2xl transition-transform duration-300 ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
        role="dialog"
        aria-label="Settings"
      >
        <header className="flex items-center justify-between border-b border-line px-5 py-4">
          <div className="flex items-center gap-2">
            <IconSettings width={18} height={18} className="text-signal" />
            <h2 className="font-display text-lg font-semibold">Settings</h2>
          </div>
          <button onClick={onClose} aria-label="Close settings" className="rounded-lg p-1.5 text-ink-mute hover:bg-panel hover:text-ink">
            <IconX />
          </button>
        </header>

        {/* tabs */}
        <div className="flex gap-1 border-b border-line px-4 pt-3">
          <TabBtn active={tab === "config"} onClick={() => setTab("config")} dot={hasAI}>
            API Config
          </TabBtn>
          <TabBtn active={tab === "discord"} onClick={() => setTab("discord")} dot={hasDiscord}>
            Discord
          </TabBtn>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-5">
          {tab === "config" ? (
            <div className="space-y-5">
              <Labeled label="OpenRouter API Key" hint="Required. Get one free at openrouter.ai/keys">
                <input
                  type="password"
                  className={inputCls}
                  placeholder="sk-or-v1-…"
                  value={settings.openrouterKey || ""}
                  onChange={(e) => update({ openrouterKey: e.target.value })}
                />
              </Labeled>

              <Labeled label="AI Model" hint="Any OpenRouter model. Free models cost nothing.">
                <select
                  className={inputCls}
                  value={customModel ? "__custom" : settings.model}
                  onChange={(e) => {
                    if (e.target.value === "__custom") {
                      setCustomModel(settings.model || "");
                    } else {
                      setCustomModel("");
                      update({ model: e.target.value });
                    }
                  }}
                >
                  {MODEL_OPTIONS.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label}
                    </option>
                  ))}
                  <option value="__custom">Custom model id…</option>
                </select>
                {customModel !== "" && (
                  <input
                    className={`${inputCls} mt-2 font-mono text-xs`}
                    placeholder="provider/model-name"
                    value={customModel}
                    onChange={(e) => {
                      setCustomModel(e.target.value);
                      update({ model: e.target.value });
                    }}
                  />
                )}
              </Labeled>

              <Labeled label="Serper.dev API Key" hint="Optional but recommended — powers name→site, contact & competitor search.">
                <input
                  type="password"
                  className={inputCls}
                  placeholder="Serper API key"
                  value={settings.serperKey || ""}
                  onChange={(e) => update({ serperKey: e.target.value })}
                />
              </Labeled>

              <StatusRow items={[["OpenRouter", hasAI], ["Serper.dev", hasSearch]]} />
            </div>
          ) : (
            <div className="space-y-5">
              <p className="rounded-lg border border-line bg-panel px-3 py-2.5 text-[12px] leading-relaxed text-ink-dim">
                <IconDiscord width={14} height={14} className="mb-0.5 mr-1 inline text-discord" />
                After a report is generated, Scout sends the applicant details, company, and PDF to your Discord channel automatically.
              </p>
              <Labeled label="Discord Bot Token">
                <input type="password" className={inputCls} placeholder="Bot token"
                  value={settings.discordBotToken || ""} onChange={(e) => update({ discordBotToken: e.target.value })} />
              </Labeled>
              <Labeled label="Discord Channel ID">
                <input className={`${inputCls} font-mono text-xs`} placeholder="123456789012345678"
                  value={settings.discordChannelId || ""} onChange={(e) => update({ discordChannelId: e.target.value })} />
              </Labeled>
              <div className="h-px bg-line" />
              <Labeled label="Applicant Name">
                <input className={inputCls} placeholder="Your full name"
                  value={settings.applicantName || ""} onChange={(e) => update({ applicantName: e.target.value })} />
              </Labeled>
              <Labeled label="Applicant Email">
                <input type="email" className={inputCls} placeholder="you@example.com"
                  value={settings.applicantEmail || ""} onChange={(e) => update({ applicantEmail: e.target.value })} />
              </Labeled>
              <StatusRow items={[["Discord ready", hasDiscord]]} />
            </div>
          )}
        </div>

        <footer className="border-t border-line px-5 py-4">
          <button
            onClick={() => {
              flashSaved();
              onClose();
            }}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-signal px-4 py-2.5 text-sm font-semibold text-base transition hover:brightness-110"
          >
            {saved ? <IconCheck width={16} height={16} /> : null}
            {saved ? "Saved" : "Save Configuration"}
          </button>
          <p className="mt-2 text-center text-[10px] text-ink-mute">
            Keys stay in memory for this session only — never stored.
          </p>
        </footer>
      </aside>
    </>
  );
}

function TabBtn({
  active,
  onClick,
  dot,
  children,
}: {
  active: boolean;
  onClick: () => void;
  dot: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`relative flex items-center gap-1.5 rounded-t-lg px-3 py-2 text-sm font-medium transition ${
        active ? "bg-panel text-ink" : "text-ink-mute hover:text-ink-dim"
      }`}
    >
      {children}
      <span className={`h-1.5 w-1.5 rounded-full ${dot ? "bg-signal" : "bg-line"}`} />
    </button>
  );
}

function StatusRow({ items }: { items: [string, boolean][] }) {
  return (
    <div className="flex flex-wrap gap-2 pt-1">
      {items.map(([label, ok]) => (
        <span
          key={label}
          className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider ${
            ok ? "border-signal/30 bg-signal/10 text-signal" : "border-line text-ink-mute"
          }`}
        >
          <span className={`h-1.5 w-1.5 rounded-full ${ok ? "bg-signal" : "bg-ink-mute"}`} />
          {label}
        </span>
      ))}
    </div>
  );
}
