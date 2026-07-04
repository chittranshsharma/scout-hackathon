"use client";

import { useState } from "react";
import type { Report } from "@/lib/types";
import { IconCheck, IconDiscord, IconDownload, IconLink } from "./icons";

type DiscordState = "idle" | "sending" | "sent" | "error";

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-divider-soft px-6 py-5 first:border-t-0">
      <h3 className="type-caption-strong mb-3 text-ink-muted-48">{label}</h3>
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
    <article className="animate-fadeup shadow-product overflow-hidden rounded-lg border border-hairline bg-canvas">
      {/* Header */}
      <header className="px-6 py-6">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="type-fine-print mb-1.5 text-ink-muted-48">Intelligence Dossier</div>
            <h2 className="type-display-lg text-ink" style={{ fontSize: 28 }}>
              {c.name}
            </h2>
            {c.website && (
              <a
                href={c.website}
                target="_blank"
                rel="noreferrer noopener"
                className="type-caption mt-1.5 inline-flex items-center gap-1.5 text-primary hover:underline"
              >
                <IconLink width={13} height={13} />
                {c.website.replace(/^https?:\/\//, "")}
              </a>
            )}
          </div>
          <span className="type-caption-strong inline-flex shrink-0 items-center gap-1.5 rounded-pill bg-parchment px-3 py-1 text-ink">
            <IconCheck width={12} height={12} /> Complete
          </span>
        </div>
      </header>

      <Section label="Company Information">
        <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Phone" value={c.phone} />
          <Field label="Address" value={c.address} />
        </dl>
      </Section>

      {c.summary && (
        <Section label="Summary">
          <p className="type-body text-ink-muted-80">{c.summary}</p>
        </Section>
      )}

      {c.products.length > 0 && (
        <Section label="Products & Services">
          <div className="flex flex-wrap gap-2">
            {c.products.map((p, i) => (
              <span key={i} className="type-caption rounded-pill border border-hairline px-3 py-1.5 text-ink">
                {p}
              </span>
            ))}
          </div>
        </Section>
      )}

      {c.painPoints.length > 0 && (
        <Section label="AI-Generated Pain Points">
          <ul className="space-y-2.5">
            {c.painPoints.map((p, i) => (
              <li key={i} className="type-body flex gap-3 text-ink-muted-80">
                <span className="mt-2.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                {p}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {report.competitors.length > 0 && (
        <Section label="Competitors">
          <div className="divide-y divide-divider-soft">
            {report.competitors.map((comp, i) => (
              <div key={i} className="flex items-center justify-between gap-3 py-3">
                <span className="type-body-strong truncate text-ink">{comp.name}</span>
                {comp.website ? (
                  <a
                    href={comp.website}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="type-caption shrink-0 text-primary hover:underline"
                  >
                    {comp.website.replace(/^https?:\/\//, "").replace(/\/$/, "")}
                  </a>
                ) : (
                  <span className="type-caption text-ink-muted-48">—</span>
                )}
              </div>
            ))}
          </div>
        </Section>
      )}

      {report.sources.length > 0 && (
        <Section label={`Sources (${report.sources.length})`}>
          <button
            onClick={() => setSourcesOpen((o) => !o)}
            className="type-caption text-primary hover:underline"
          >
            {sourcesOpen ? "Hide references" : "Show references"}
          </button>
          {sourcesOpen && (
            <ul className="mt-3 space-y-1.5">
              {report.sources.map((s, i) => (
                <li key={i} className="truncate">
                  <a
                    href={s}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="type-fine-print text-ink-muted-48 hover:text-primary"
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
      <footer className="flex flex-col gap-3 border-t border-divider-soft px-6 py-5 sm:flex-row sm:items-center">
        <button
          onClick={handleDownload}
          disabled={downloading}
          className="press-scale type-body inline-flex items-center justify-center gap-2 rounded-pill bg-primary px-[22px] py-[11px] text-white transition-colors hover:bg-primary-focus disabled:opacity-60"
        >
          <IconDownload width={16} height={16} />
          {downloading ? "Preparing…" : "Download PDF"}
        </button>

        {discordEnabled && (
          <button
            onClick={onDiscord}
            disabled={discordState === "sending" || discordState === "sent"}
            className="press-scale type-body inline-flex items-center justify-center gap-2 rounded-pill border border-primary px-[22px] py-[11px] text-primary transition-colors hover:bg-primary/5 disabled:opacity-60"
          >
            {discordState === "sent" ? <IconCheck width={16} height={16} /> : <IconDiscord width={16} height={16} />}
            {discordState === "sent" ? "Sent to Discord" : discordState === "sending" ? "Sending…" : "Send to Discord"}
          </button>
        )}

        <span className="type-fine-print text-ink-muted-48 sm:ml-auto">{report.model}</span>
      </footer>
      {discordState === "error" && discordError && (
        <p className="type-fine-print border-t border-divider-soft px-6 py-2.5" style={{ color: "var(--color-danger)" }}>
          Discord: {discordError}
        </p>
      )}
    </article>
  );
}

function Field({ label, value }: { label: string; value?: string }) {
  return (
    <div>
      <div className="type-fine-print text-ink-muted-48">{label}</div>
      <div className={`type-body ${value ? "text-ink" : "text-ink-muted-48 italic"}`}>
        {value || "Not publicly listed"}
      </div>
    </div>
  );
}
