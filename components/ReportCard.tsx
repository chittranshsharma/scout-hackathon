"use client";

import { useState } from "react";
import type { Report } from "@/lib/types";
import {
  IconAlert,
  IconCheck,
  IconDiscord,
  IconDownload,
  IconGlobe,
  IconLink,
  IconPhone,
  IconPin,
  IconSpark,
  IconTarget,
} from "./icons";

type DiscordState = "idle" | "sending" | "sent" | "error";

function Section({
  label,
  icon,
  children,
}: {
  label: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="border-t border-line-soft px-5 py-4 sm:px-6">
      <h3 className="mb-3 flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.18em] text-signal">
        {icon}
        {label}
      </h3>
      {children}
    </section>
  );
}

export default function ReportCard({
  report,
  onDownload,
  onDiscord,
  discordState,
  discordEnabled,
  discordError,
}: {
  report: Report;
  onDownload: () => void;
  onDiscord: () => void;
  discordState: DiscordState;
  discordEnabled: boolean;
  discordError?: string;
}) {
  const c = report.company;
  const [downloading, setDownloading] = useState(false);
  const [sourcesOpen, setSourcesOpen] = useState(false);

  const handleDownload = async () => {
    setDownloading(true);
    try {
      await onDownload();
    } finally {
      setDownloading(false);
    }
  };

  return (
    <article className="animate-fadeup overflow-hidden rounded-2xl border border-line bg-panel/80 backdrop-blur-sm shadow-[0_20px_60px_-30px_#000]">
      {/* Header */}
      <header className="relative border-b border-line bg-base-2/60 px-5 py-5 sm:px-6">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.25em] text-ink-mute">
              Intelligence Dossier
            </div>
            <h2 className="font-display text-2xl font-semibold leading-tight text-ink sm:text-3xl">
              {c.name}
            </h2>
            {c.website && (
              <a
                href={c.website}
                target="_blank"
                rel="noreferrer noopener"
                className="mt-1.5 inline-flex items-center gap-1.5 font-mono text-xs text-signal hover:underline"
              >
                <IconLink width={13} height={13} />
                {c.website.replace(/^https?:\/\//, "")}
              </a>
            )}
          </div>
          <span className="flex shrink-0 items-center gap-1.5 rounded-full border border-signal/30 bg-signal/10 px-3 py-1 font-mono text-[10px] uppercase tracking-widest text-signal">
            <IconCheck width={12} height={12} /> Complete
          </span>
        </div>
      </header>

      {/* Contact */}
      <Section label="Company Information" icon={<IconGlobe width={13} height={13} />}>
        <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field icon={<IconPhone width={14} height={14} />} label="Phone" value={c.phone} />
          <Field icon={<IconPin width={14} height={14} />} label="Address" value={c.address} />
        </dl>
      </Section>

      {/* Summary */}
      {c.summary && (
        <Section label="Summary" icon={<IconSpark width={13} height={13} />}>
          <p className="text-sm leading-relaxed text-ink-dim">{c.summary}</p>
        </Section>
      )}

      {/* Products */}
      {c.products.length > 0 && (
        <Section label="Products & Services">
          <div className="flex flex-wrap gap-2">
            {c.products.map((p, i) => (
              <span
                key={i}
                className="rounded-lg border border-line bg-base/60 px-3 py-1.5 text-[13px] text-ink-dim"
              >
                {p}
              </span>
            ))}
          </div>
        </Section>
      )}

      {/* Pain points */}
      {c.painPoints.length > 0 && (
        <Section label="AI-Generated Pain Points" icon={<IconAlert width={13} height={13} />}>
          <ul className="space-y-2.5">
            {c.painPoints.map((p, i) => (
              <li key={i} className="flex gap-3 text-sm leading-relaxed text-ink-dim">
                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-amber" />
                {p}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {/* Competitors */}
      {report.competitors.length > 0 && (
        <Section label="Competitors" icon={<IconTarget width={13} height={13} />}>
          <div className="overflow-hidden rounded-xl border border-line-soft">
            {report.competitors.map((comp, i) => (
              <div
                key={i}
                className="flex items-center justify-between gap-3 border-b border-line-soft px-4 py-3 last:border-0 hover:bg-base/40"
              >
                <span className="truncate text-sm font-medium text-ink">{comp.name}</span>
                {comp.website ? (
                  <a
                    href={comp.website}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="shrink-0 font-mono text-xs text-signal hover:underline"
                  >
                    {comp.website.replace(/^https?:\/\//, "").replace(/\/$/, "")}
                  </a>
                ) : (
                  <span className="font-mono text-xs text-ink-mute">—</span>
                )}
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Sources */}
      {report.sources.length > 0 && (
        <Section label={`Sources (${report.sources.length})`}>
          <button
            onClick={() => setSourcesOpen((o) => !o)}
            className="font-mono text-xs text-ink-mute hover:text-ink-dim"
          >
            {sourcesOpen ? "Hide references ▲" : "Show references ▼"}
          </button>
          {sourcesOpen && (
            <ul className="mt-3 space-y-1.5">
              {report.sources.map((s, i) => (
                <li key={i} className="truncate">
                  <a
                    href={s}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="font-mono text-[11px] text-ink-dim hover:text-signal"
                  >
                    {s}
                  </a>
                </li>
              ))}
            </ul>
          )}
        </Section>
      )}

      {/* Actions */}
      <footer className="flex flex-col gap-3 border-t border-line bg-base-2/60 px-5 py-4 sm:flex-row sm:items-center sm:px-6">
        <button
          onClick={handleDownload}
          disabled={downloading}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-amber px-4 py-2.5 text-sm font-semibold text-base transition hover:brightness-110 disabled:opacity-60"
        >
          {downloading ? (
            <span className="h-4 w-4 animate-spin-slow rounded-full border-2 border-base border-t-transparent" />
          ) : (
            <IconDownload width={16} height={16} />
          )}
          {downloading ? "Preparing…" : "Download PDF"}
        </button>

        {discordEnabled && (
          <button
            onClick={onDiscord}
            disabled={discordState === "sending" || discordState === "sent"}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-discord/40 bg-discord/10 px-4 py-2.5 text-sm font-semibold text-ink transition hover:bg-discord/20 disabled:opacity-70"
          >
            {discordState === "sending" ? (
              <span className="h-4 w-4 animate-spin-slow rounded-full border-2 border-discord border-t-transparent" />
            ) : discordState === "sent" ? (
              <IconCheck width={16} height={16} />
            ) : (
              <IconDiscord width={16} height={16} />
            )}
            {discordState === "sent"
              ? "Sent to Discord"
              : discordState === "sending"
                ? "Sending…"
                : "Send to Discord"}
          </button>
        )}

        <span className="font-mono text-[11px] text-ink-mute sm:ml-auto">
          {report.model}
        </span>
      </footer>
      {discordState === "error" && discordError && (
        <p className="border-t border-danger/20 bg-danger/5 px-6 py-2 font-mono text-[11px] text-danger">
          Discord: {discordError}
        </p>
      )}
    </article>
  );
}

function Field({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value?: string;
}) {
  return (
    <div className="flex items-start gap-2.5 rounded-lg border border-line-soft bg-base/40 px-3 py-2.5">
      <span className="mt-0.5 text-ink-mute">{icon}</span>
      <div className="min-w-0">
        <div className="font-mono text-[10px] uppercase tracking-wider text-ink-mute">{label}</div>
        <div className={`text-sm ${value ? "text-ink" : "text-ink-mute italic"}`}>
          {value || "Not publicly listed"}
        </div>
      </div>
    </div>
  );
}
