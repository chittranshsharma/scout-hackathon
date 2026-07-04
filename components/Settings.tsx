"use client";

import { useState } from "react";
import { useSettings } from "@/lib/store";
import { MODEL_OPTIONS } from "@/lib/types";
import { IconCheck, IconDiscord, IconSettings, IconX } from "./icons";

function Labeled({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="type-caption-strong mb-1.5 block text-ink-muted-80">{label}</span>
      {children}
      {hint && <span className="type-fine-print mt-1.5 block text-ink-muted-48">{hint}</span>}
    </label>
  );
}

const inputCls =
  "w-full rounded-pill border border-hairline bg-canvas px-5 py-3 h-11 type-body text-ink placeholder:text-ink-muted-48 focus:border-primary focus:outline-none";

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

  const selectModel = (id: string) => {
    setCustomModel("");
    update({ model: id });
  };

  return (
    <>
      <div
        onClick={onClose}
        className={`fixed inset-0 z-40 bg-black/30 transition-opacity ${
          open ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      />
      <aside
        className={`fixed right-0 top-0 z-50 flex h-full w-full max-w-md flex-col border-l border-hairline bg-parchment/85 backdrop-blur-xl transition-transform duration-300 ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
        role="dialog"
        aria-label="Settings"
      >
        <header className="flex items-center justify-between px-6 py-5">
          <div className="flex items-center gap-2">
            <IconSettings width={18} height={18} className="text-primary" />
            <h2 className="type-tagline text-ink">Settings</h2>
          </div>
          <button onClick={onClose} aria-label="Close settings" className="press-scale rounded-full p-1.5 text-ink-muted-48 hover:text-ink">
            <IconX />
          </button>
        </header>

        <div className="flex gap-2 px-6">
          <TabBtn active={tab === "config"} onClick={() => setTab("config")} dot={hasAI}>
            API Config
          </TabBtn>
          <TabBtn active={tab === "discord"} onClick={() => setTab("discord")} dot={hasDiscord}>
            Discord
          </TabBtn>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-6">
          {tab === "config" ? (
            <div className="space-y-6">
              <Labeled label="OpenRouter API Key" hint="Required. Get one free at openrouter.ai/keys">
                <input
                  type="password"
                  className={inputCls}
                  placeholder="sk-or-v1-…"
                  value={settings.openrouterKey || ""}
                  onChange={(e) => update({ openrouterKey: e.target.value })}
                />
              </Labeled>

              <div>
                <span className="type-caption-strong mb-2.5 block text-ink-muted-80">AI Model</span>
                <div className="flex flex-wrap gap-2">
                  {MODEL_OPTIONS.map((m) => {
                    const selected = !customModel && settings.model === m.id;
                    return (
                      <button
                        key={m.id}
                        onClick={() => selectModel(m.id)}
                        className={`press-scale type-caption rounded-pill border bg-canvas px-4 py-2.5 text-ink transition-colors ${
                          selected ? "border-2 border-primary-focus" : "border-hairline"
                        }`}
                      >
                        {m.label}
                      </button>
                    );
                  })}
                  <button
                    onClick={() => setCustomModel(settings.model || " ")}
                    className={`press-scale type-caption rounded-pill border bg-canvas px-4 py-2.5 text-ink transition-colors ${
                      customModel ? "border-2 border-primary-focus" : "border-hairline"
                    }`}
                  >
                    Custom…
                  </button>
                </div>
                {customModel !== "" && (
                  <input
                    className={`${inputCls} mt-3`}
                    placeholder="provider/model-name"
                    value={customModel.trim()}
                    onChange={(e) => {
                      setCustomModel(e.target.value);
                      update({ model: e.target.value });
                    }}
                  />
                )}
                <p className="type-fine-print mt-2 text-ink-muted-48">Any OpenRouter model. Free models cost nothing.</p>
              </div>

              <Labeled
                label="Serper.dev API Key"
                hint="Optional but recommended — powers name→site, contact & competitor search."
              >
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
            <div className="space-y-6">
              <p className="type-caption rounded-lg border border-hairline bg-canvas px-4 py-3 text-ink-muted-80">
                <IconDiscord width={14} height={14} className="mb-0.5 mr-1 inline text-primary" />
                After a report is generated, Scout sends the applicant details, company, and PDF to your Discord channel automatically.
              </p>
              <Labeled label="Discord Bot Token">
                <input
                  type="password"
                  className={inputCls}
                  placeholder="Bot token"
                  value={settings.discordBotToken || ""}
                  onChange={(e) => update({ discordBotToken: e.target.value })}
                />
              </Labeled>
              <Labeled label="Discord Channel ID">
                <input
                  className={inputCls}
                  placeholder="123456789012345678"
                  value={settings.discordChannelId || ""}
                  onChange={(e) => update({ discordChannelId: e.target.value })}
                />
              </Labeled>
              <div className="h-px bg-divider-soft" />
              <Labeled label="Applicant Name">
                <input
                  className={inputCls}
                  placeholder="Your full name"
                  value={settings.applicantName || ""}
                  onChange={(e) => update({ applicantName: e.target.value })}
                />
              </Labeled>
              <Labeled label="Applicant Email">
                <input
                  type="email"
                  className={inputCls}
                  placeholder="you@example.com"
                  value={settings.applicantEmail || ""}
                  onChange={(e) => update({ applicantEmail: e.target.value })}
                />
              </Labeled>
              <StatusRow items={[["Discord ready", hasDiscord]]} />
            </div>
          )}
        </div>

        <footer className="px-6 py-5">
          <button
            onClick={() => {
              flashSaved();
              onClose();
            }}
            className="press-scale type-body flex w-full items-center justify-center gap-2 rounded-pill bg-primary py-3 text-white transition-colors hover:bg-primary-focus"
          >
            {saved ? <IconCheck width={16} height={16} /> : null}
            {saved ? "Saved" : "Save Configuration"}
          </button>
          <p className="type-fine-print mt-2.5 text-center text-ink-muted-48">
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
      className={`press-scale type-caption-strong relative flex items-center gap-1.5 rounded-pill px-4 py-2 transition-colors ${
        active ? "bg-ink text-white" : "text-ink-muted-48 hover:text-ink"
      }`}
    >
      {children}
      <span
        className="h-1.5 w-1.5 rounded-full"
        style={{ background: dot ? "var(--color-primary-on-dark)" : "currentColor", opacity: dot ? 1 : 0.3 }}
      />
    </button>
  );
}

function StatusRow({ items }: { items: [string, boolean][] }) {
  return (
    <div className="flex flex-wrap gap-2 pt-1">
      {items.map(([label, ok]) => (
        <span
          key={label}
          className={`type-fine-print inline-flex items-center gap-1.5 rounded-pill border px-3 py-1.5 ${
            ok ? "border-primary text-primary" : "border-hairline text-ink-muted-48"
          }`}
        >
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: ok ? "var(--color-primary)" : "var(--color-hairline)" }} />
          {label}
        </span>
      ))}
    </div>
  );
}
