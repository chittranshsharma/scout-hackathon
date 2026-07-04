"use client";

import { useEffect, useRef, useState } from "react";
import { useSettings } from "@/lib/store";
import { MODEL_OPTIONS, type ConfidenceTier, type OutreachEmail, type Report } from "@/lib/types";
import { IconCheck, IconDiscord, IconDownload, IconLink } from "./icons";

type DiscordState = "idle" | "sending" | "sent" | "error";

const CONF_LABEL: Record<ConfidenceTier, string> = {
  high: "High confidence",
  moderate: "Moderate",
  inferred: "AI-inferred",
};

function ConfidenceBadge({ tier }: { tier?: ConfidenceTier }) {
  if (!tier) return null;
  return (
    <span className="type-fine-print inline-flex items-center gap-1 rounded-pill border border-hairline px-2 py-0.5 text-ink-muted-48">
      <span className="relative flex h-1.5 w-1.5 items-center justify-center">
        <span
          className="absolute inline-flex h-full w-full rounded-full animate-ping opacity-60"
          style={{ background: tier === "high" ? "#1d1d1f" : tier === "moderate" ? "#7a7a7a" : "#c7c7cc" }}
        />
        <span
          className="relative inline-flex h-1.5 w-1.5 rounded-full"
          style={{ background: tier === "high" ? "#1d1d1f" : tier === "moderate" ? "#7a7a7a" : "#c7c7cc" }}
        />
      </span>
      {CONF_LABEL[tier]}
    </span>
  );
}

function useTypewriter(text: string, enabled: boolean, speed = 12) {
  const [out, setOut] = useState(enabled ? "" : text);
  const started = useRef(false);
  useEffect(() => {
    if (!enabled || started.current) {
      setOut(text);
      return;
    }
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce || !text) {
      setOut(text);
      return;
    }
    started.current = true;
    let i = 0;
    const id = setInterval(() => {
      i += 3;
      setOut(text.slice(0, i));
      if (i >= text.length) clearInterval(id);
    }, speed);
    return () => clearInterval(id);
  }, [text, enabled, speed]);
  return out;
}

function reportToMarkdown(r: Report): string {
  const c = r.company;
  const lines = [
    `# ${c.name}`,
    c.website ? `Website: ${c.website}` : "",
    c.phone ? `Phone: ${c.phone}` : "",
    c.address ? `Address: ${c.address}` : "",
    "",
    c.summary ? `## Summary\n${c.summary}` : "",
    c.products.length ? `## Products & Services\n${c.products.map((p) => `- ${p}`).join("\n")}` : "",
    c.painPoints.length ? `## Pain Points\n${c.painPoints.map((p) => `- ${p}`).join("\n")}` : "",
    r.competitors.length
      ? `## Competitors\n${r.competitors.map((x) => `- ${x.name}${x.website ? ` — ${x.website}` : ""}`).join("\n")}`
      : "",
    r.socials?.length ? `## Social\n${r.socials.map((soc) => `- ${soc.type}: ${soc.url}`).join("\n")}` : "",
  ];
  return lines.filter(Boolean).join("\n\n");
}

function Section({
  label,
  children,
  action,
  tier,
}: {
  label: string;
  children: React.ReactNode;
  action?: React.ReactNode;
  tier?: ConfidenceTier;
}) {
  return (
    <section className="group relative px-6 py-5">
      <div className="absolute top-0 left-0 right-0 h-[1px] bg-[linear-gradient(90deg,transparent,var(--color-hairline),transparent)] group-first:hidden" />
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h3 className="type-caption-strong text-ink-muted-48">{label}</h3>
          <ConfidenceBadge tier={tier} />
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

export default function ReportCard({
  report,
  onDownload,
  onDiscord,
  onRegenerate,
  onReportUpdate,
  context,
  discordState,
  discordEnabled,
  discordError,
  discordAt,
  isNew,
}: {
  report: Report;
  onDownload: () => void;
  onDiscord: () => void;
  onRegenerate: () => void;
  onReportUpdate: (r: Report) => void;
  context?: string;
  discordState: DiscordState;
  discordEnabled: boolean;
  discordError?: string;
  discordAt?: string;
  isNew: boolean;
}) {
  const { settings } = useSettings();
  const c = report.company;
  const accent = report.brandColor || "var(--color-primary)";
  const [downloading, setDownloading] = useState(false);
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [logoOk, setLogoOk] = useState(true);
  const summary = useTypewriter(c.summary, isNew);

  // Outreach email draft — cached in component state per report.
  const [email, setEmail] = useState<OutreachEmail | null>(null);
  const [editedEmailBody, setEditedEmailBody] = useState("");
  const [emailLoading, setEmailLoading] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [emailCopied, setEmailCopied] = useState(false);

  const draftEmail = async () => {
    setEmailLoading(true);
    setEmailError(null);
    try {
      const res = await fetch("/api/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ report, settings }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setEmail(data);
      setEditedEmailBody(data.body);
    } catch (err) {
      setEmailError(err instanceof Error ? err.message : "Draft failed");
    } finally {
      setEmailLoading(false);
    }
  };

  // Re-run analysis with a different model (no re-crawl) for quick comparison.
  const [rerunModel, setRerunModel] = useState(report.model);
  const [rerunning, setRerunning] = useState(false);
  const [rerunError, setRerunError] = useState<string | null>(null);
  const modelOptions = MODEL_OPTIONS.some((m) => m.id === report.model)
    ? MODEL_OPTIONS
    : [{ id: report.model, label: report.model }, ...MODEL_OPTIONS];

  const rerun = async () => {
    if (!context) return;
    setRerunning(true);
    setRerunError(null);
    try {
      const res = await fetch("/api/reanalyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ report, context, settings: { ...settings, model: rerunModel } }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      onReportUpdate(data);
    } catch (err) {
      setRerunError(err instanceof Error ? err.message : "Re-run failed");
    } finally {
      setRerunning(false);
    }
  };

  const download = (content: string, filename: string, type: string) => {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };
  const slug = c.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase();

  const downloadCsv = () => {
    const esc = (s?: string) => `"${(s || "").replace(/"/g, '""')}"`;
    const comps = report.competitors.map((x) => x.name).join(", ");
    const headers = ["Name", "Website", "Phone", "Address", "Summary", "Products", "PainPoints", "Competitors"];
    const row = [
      c.name,
      c.website,
      c.phone,
      c.address,
      c.summary,
      c.products.join(", "),
      c.painPoints.join(" | "),
      comps,
    ].map(esc);
    download(`${headers.join(",")}\n${row.join(",")}`, `${slug}-lead.csv`, "text/csv");
  };

  const handleDownload = async () => {
    setDownloading(true);
    try {
      await onDownload();
    } finally {
      setDownloading(false);
    }
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(reportToMarkdown(report));
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  return (
    <article className="animate-fadeup shadow-product overflow-hidden rounded-lg border border-hairline bg-canvas">
      {/* brand accent strip */}
      <div style={{ height: 4, background: accent }} />

      {/* Header */}
      <header className="px-6 py-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-4">
            {report.logo && logoOk && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={report.logo}
                alt={`${c.name} logo`}
                width={48}
                height={48}
                onError={() => setLogoOk(false)}
                className="h-12 w-12 shrink-0 rounded-md border border-hairline bg-white object-contain p-1"
              />
            )}
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
                  className="type-caption mt-1.5 inline-flex items-center gap-1.5 hover:underline"
                  style={{ color: accent }}
                >
                  <IconLink width={13} height={13} />
                  {c.website.replace(/^https?:\/\//, "")}
                </a>
              )}
            </div>
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
        <Section label="Summary" tier={report.confidence?.summary}>
          <p className="type-body text-ink-muted-80">{summary}</p>
        </Section>
      )}

      {c.products.length > 0 && (
        <Section label="Products & Services" tier={report.confidence?.products}>
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
        <Section label="AI-Generated Pain Points" tier={report.confidence?.painPoints}>
          <ul className="space-y-2.5">
            {c.painPoints.map((p, i) => (
              <li key={i} className="type-body flex gap-3 text-ink-muted-80">
                <span className="mt-2.5 h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: accent }} />
                {p}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {report.competitorMatrix && report.competitorMatrix.length > 0 ? (
        <Section label="Competitor Matrix" tier={report.confidence?.competitors}>
          <div className="overflow-x-auto rounded-lg border border-hairline bg-canvas">
            <table className="w-full text-left border-collapse min-w-[600px]">
              <thead>
                <tr className="bg-parchment/40">
                  <th className="px-4 py-3 type-fine-print text-ink-muted-48 font-normal border-b border-divider-soft">Competitor</th>
                  <th className="px-4 py-3 type-fine-print text-ink-muted-48 font-normal border-b border-divider-soft">Target Audience</th>
                  <th className="px-4 py-3 type-fine-print text-ink-muted-48 font-normal border-b border-divider-soft">Core Strength</th>
                  <th className="px-4 py-3 type-fine-print text-ink-muted-48 font-normal border-b border-divider-soft">Pricing Model</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-divider-soft">
                {report.competitorMatrix.map((comp, i) => (
                  <tr key={i} className="hover:bg-[var(--color-parchment)] transition-colors">
                    <td className="px-4 py-3 type-body-strong text-ink whitespace-nowrap">{comp.name}</td>
                    <td className={`px-4 py-3 type-caption ${comp.audience === "Not publicly disclosed" ? "text-ink-muted-48 italic" : "text-ink-muted-80"}`}>{comp.audience}</td>
                    <td className={`px-4 py-3 type-caption ${comp.coreStrength === "Not publicly disclosed" ? "text-ink-muted-48 italic" : "text-ink-muted-80"}`}>{comp.coreStrength}</td>
                    <td className={`px-4 py-3 type-caption ${comp.pricingModel === "Not publicly disclosed" ? "text-ink-muted-48 italic" : "text-ink-muted-80"}`}>{comp.pricingModel}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      ) : report.competitors.length > 0 && (
        <Section label="Competitors" tier={report.confidence?.competitors}>
          <div className="divide-y divide-divider-soft">
            {report.competitors.map((comp, i) => (
              <div key={i} className="flex items-center justify-between gap-3 py-3">
                <span className="type-body-strong truncate text-ink">{comp.name}</span>
                {comp.website ? (
                  <a
                    href={comp.website}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="type-caption shrink-0 hover:underline"
                    style={{ color: accent }}
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

      {report.socials && report.socials.length > 0 && (
        <Section label="Social Profiles">
          <div className="flex flex-wrap gap-2">
            {report.socials.map((soc, i) => (
              <a
                key={i}
                href={soc.url}
                target="_blank"
                rel="noreferrer noopener"
                className="type-caption rounded-pill border border-hairline px-3 py-1.5 hover:underline text-primary"
              >
                {soc.type}
              </a>
            ))}
          </div>
        </Section>
      )}

      <Section label="Sales Outreach">
        {!email ? (
          <div>
            <button
              onClick={draftEmail}
              disabled={emailLoading}
              className="press-scale type-body inline-flex items-center gap-2 rounded-pill border border-primary px-[22px] py-[11px] text-primary transition-colors hover:bg-primary/5 disabled:opacity-60"
            >
              {emailLoading ? "Drafting…" : "Draft Outreach Email"}
            </button>
            {emailError && (
              <p className="type-fine-print mt-2" style={{ color: "var(--color-danger)" }}>
                {emailError} ·{" "}
                <button onClick={draftEmail} className="underline">
                  Retry
                </button>
              </p>
            )}
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg border border-hairline bg-canvas shadow-sm">
            {/* macOS window header controls */}
            <div className="flex items-center gap-1.5 border-b border-divider-soft bg-parchment/80 px-4 py-3">
              <span className="h-3 w-3 rounded-full bg-red-400/80" style={{ backgroundColor: "#ff5f56" }} />
              <span className="h-3 w-3 rounded-full bg-yellow-400/80" style={{ backgroundColor: "#ffbd2e" }} />
              <span className="h-3 w-3 rounded-full bg-green-400/80" style={{ backgroundColor: "#27c93f" }} />
              <span className="type-caption mx-auto text-ink-muted-48">New Message</span>
            </div>
            
            {/* Headers */}
            <div className="border-b border-divider-soft bg-canvas px-4 py-2.5 space-y-2">
              <div className="flex items-center text-ink-muted-48">
                <span className="type-caption w-16 shrink-0">To:</span>
                <span className="type-caption-strong text-ink">{c.name} Team</span>
              </div>
              <div className="flex items-center text-ink-muted-48">
                <span className="type-caption w-16 shrink-0">Subject:</span>
                <span className="type-caption-strong text-ink">{email.subject}</span>
              </div>
            </div>

            {/* Email Body */}
            <div className="bg-canvas px-5 py-6 min-h-[160px] flex flex-col">
              <textarea
                value={editedEmailBody}
                onChange={(e) => setEditedEmailBody(e.target.value)}
                className="type-body text-ink-muted-80 leading-relaxed font-sans bg-transparent border-none resize-y outline-none min-h-[160px] w-full"
              />
            </div>

            {/* Toolbar Action Bar */}
            <div className="flex flex-wrap items-center justify-between border-t border-divider-soft bg-parchment/40 px-4 py-3 gap-2">
              <a
                href={`mailto:?subject=${encodeURIComponent(email.subject)}&body=${encodeURIComponent(editedEmailBody)}`}
                className="press-scale type-caption-strong inline-flex items-center justify-center gap-1.5 rounded bg-primary px-4 py-2 text-white hover:bg-primary-focus transition-colors"
              >
                Draft in Mail
              </a>
              <div className="flex gap-2">
                <button
                  onClick={async () => {
                    await navigator.clipboard.writeText(`Subject: ${email.subject}\n\n${editedEmailBody}`);
                    setEmailCopied(true);
                    setTimeout(() => setEmailCopied(false), 1600);
                  }}
                  className="press-scale type-caption rounded border border-hairline bg-canvas px-3 py-2 text-ink hover:bg-parchment/20 transition-colors"
                >
                  {emailCopied ? "Copied ✓" : "Copy text"}
                </button>
                <button
                  onClick={draftEmail}
                  disabled={emailLoading}
                  className="press-scale type-caption rounded border border-hairline bg-canvas px-3 py-2 text-ink hover:bg-parchment/20 transition-colors disabled:opacity-50"
                >
                  {emailLoading ? "Drafting…" : "Regenerate"}
                </button>
              </div>
            </div>
          </div>
        )}
      </Section>

      {report.sources.length > 0 && (
        <Section label={`Sources (${report.sources.length})`}>
          <button onClick={() => setSourcesOpen((o) => !o)} className="type-caption hover:underline" style={{ color: accent }}>
            {sourcesOpen ? "Hide references" : "Show references"}
          </button>
          {sourcesOpen && (
            <ol className="mt-3 space-y-1.5">
              {report.sources.map((src, i) => (
                <li key={i} className="flex gap-2 truncate">
                  <span className="type-fine-print shrink-0 text-ink-muted-48">[{i + 1}]</span>
                  <a
                    href={src}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="type-fine-print truncate text-ink-muted-48 hover:text-ink"
                  >
                    {src}
                  </a>
                </li>
              ))}
            </ol>
          )}
        </Section>
      )}

      {report.sitemap && report.sitemap.length > 0 && (
        <Section label={`Crawl Diagnostics (${report.sitemap.length})`}>
          <div className="flex flex-wrap gap-2">
            {report.sitemap.map((s, i) => (
              <a
                key={i}
                href={s.url}
                target="_blank"
                rel="noreferrer noopener"
                className={`type-caption rounded border px-2 py-1 flex items-center gap-1.5 hover:bg-parchment/50 truncate max-w-full ${
                  s.status === "crawled"
                    ? "border-green-500/30 text-green-700 bg-green-50/10"
                    : s.status === "skipped"
                      ? "border-hairline text-ink-muted-48"
                      : "border-red-500/30 text-red-700 bg-red-50/10"
                }`}
                title={`Score: ${s.score}`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${
                  s.status === "crawled" ? "bg-green-500" : s.status === "skipped" ? "bg-ink-muted-48" : "bg-red-500"
                }`} />
                <span className="truncate">{s.url.replace(/^https?:\/\//, "").replace(/\/$/, "")}</span>
              </a>
            ))}
          </div>
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
            {discordState === "sent"
              ? `Sent to Discord${discordAt ? ` · ${new Date(discordAt).toLocaleTimeString()}` : ""}`
              : discordState === "sending"
                ? "Sending…"
                : discordState === "error"
                  ? "Retry Discord"
                  : "Send to Discord"}
          </button>
        )}

        <div className="flex items-center gap-1 sm:ml-auto">
          <button
            onClick={handleCopy}
            title="Copy Markdown"
            className="press-scale flex h-11 items-center justify-center gap-2 rounded-pill px-4 type-caption text-ink-muted-48 hover:bg-[var(--color-parchment)] hover:text-ink transition-colors"
          >
            {copied ? "Copied" : "Copy"}
          </button>
          <button
            onClick={() => download(reportToMarkdown(report), `${slug}-report.md`, "text/markdown")}
            title="Download Markdown"
            className="press-scale flex h-11 w-11 items-center justify-center rounded-pill type-caption text-ink-muted-48 hover:bg-[var(--color-parchment)] hover:text-ink transition-colors"
          >
            MD
          </button>
          <button
            onClick={() => download(JSON.stringify(report, null, 2), `${slug}-report.json`, "application/json")}
            title="Download JSON"
            className="press-scale flex h-11 w-11 items-center justify-center rounded-pill type-caption font-mono text-ink-muted-48 hover:bg-[var(--color-parchment)] hover:text-ink transition-colors"
          >
            {"{}"}
          </button>
          <button
            onClick={downloadCsv}
            title="Download CSV"
            className="press-scale flex h-11 w-11 items-center justify-center rounded-pill type-caption text-ink-muted-48 hover:bg-[var(--color-parchment)] hover:text-ink transition-colors"
          >
            CSV
          </button>
          <button
            onClick={onRegenerate}
            title="Regenerate Report"
            className="press-scale flex h-11 items-center justify-center rounded-pill px-4 type-caption text-ink-muted-48 hover:bg-[var(--color-parchment)] hover:text-ink transition-colors ml-2"
          >
            Regenerate
          </button>
        </div>
      </footer>
      {discordState === "error" && discordError && (
        <p className="type-fine-print border-t border-divider-soft px-6 py-2.5" style={{ color: "var(--color-danger)" }}>
          Discord: {discordError}
        </p>
      )}

      {context && (
        <div className="flex flex-wrap items-center gap-2 border-t border-divider-soft bg-parchment/40 px-6 py-3">
          <span className="type-fine-print text-ink-muted-48">Compare model</span>
          <select
            value={rerunModel}
            onChange={(e) => setRerunModel(e.target.value)}
            className="type-caption rounded-sm border border-hairline bg-canvas px-2 py-1 text-ink focus:border-primary focus:outline-none"
          >
            {modelOptions.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
          <button
            onClick={rerun}
            disabled={rerunning}
            className="press-scale type-caption rounded-pill border border-primary px-3 py-1 text-primary transition-colors hover:bg-primary/5 disabled:opacity-60"
          >
            {rerunning ? "Re-running…" : "Re-run"}
          </button>
          <span className="type-fine-print text-ink-muted-48">Currently: {report.model}</span>
          <span className="type-fine-print text-ink-muted-48">Recommended: Llama 3.3 70B for accuracy</span>
          {rerunError && (
            <span className="type-fine-print" style={{ color: "var(--color-danger)" }}>
              {rerunError}
            </span>
          )}
        </div>
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
