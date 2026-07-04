import { NextRequest } from "next/server";
import { resolveTarget, looksLikeUrl } from "@/lib/resolve";
import { crawlSite } from "@/lib/crawl";
import { gatherPublicInfo, findCompetitorCandidates } from "@/lib/serper";
import { analyzeCompany } from "@/lib/ai";
import { DEFAULT_MODEL, type ProgressStage, type Settings, type StreamEvent } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 120;

function sseEncode(event: StreamEvent): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(event)}\n\n`);
}

export async function POST(req: NextRequest) {
  const body = (await req.json()) as { input?: string; settings?: Settings };
  const input = (body.input || "").trim();
  const settings = body.settings || {};

  const openrouterKey = settings.openrouterKey || process.env.OPENROUTER_API_KEY;
  const serperKey = settings.serperKey || process.env.SERPER_API_KEY;
  const model = settings.model || DEFAULT_MODEL;

  const stream = new ReadableStream({
    async start(controller) {
      const send = (e: StreamEvent) => controller.enqueue(sseEncode(e));
      const progress = (stage: ProgressStage, message: string, detail?: string) =>
        send({ type: "progress", stage, message, detail });

      try {
        if (!input) throw new Error("No company name or URL provided.");
        if (!openrouterKey)
          throw new Error("OpenRouter API key missing. Add it in Config settings.");

        // 1. Resolve
        progress("resolving", "Identifying company", looksLikeUrl(input) ? "Reading provided URL" : "Finding official website");
        const resolved = await resolveTarget(input, serperKey);
        if (resolved.website) {
          progress("resolving", "Company identified", resolved.website);
        } else if (!serperKey) {
          progress("resolving", "No search key — proceeding from name only");
        } else {
          progress("resolving", "Official site not found — using search only");
        }

        const wasUrl = looksLikeUrl(input);

        // 2. Crawl
        const crawlPages: { url: string; title: string; text: string }[] = [];
        let crawlSources: string[] = [];
        let enrichment: import("@/lib/crawl").Enrichment = { socials: [] };
        if (resolved.website) {
          progress("crawling", "Crawling website", "Discovering key pages");
          try {
            const result = await crawlSite(resolved.website, (i, total, url) => {
              progress("crawling", `Crawling website (${i}/${total})`, url);
            });
            crawlPages.push(...result.pages);
            crawlSources = result.sources;
            enrichment = result.enrichment;
            progress("crawling", `Analyzed ${crawlPages.length} page(s)`);
          } catch {
            progress("crawling", "Crawl unavailable — falling back to search");
          }
        }

        // Canonical company name: for URL input, trust the site's own declared
        // name (og:site_name / <title>) over the host slug so downstream Serper
        // queries search the RIGHT company. For name input, trust the Serper
        // knowledge-graph name from resolution.
        const companyName = wasUrl ? enrichment.siteName || resolved.name : resolved.name;

        // Debug/verification log (visible in server output during testing).
        console.log(
          `[research] input=${JSON.stringify(input)} wasUrl=${wasUrl} resolvedDomain=${resolved.website || "-"} extractedName=${JSON.stringify(companyName)}`,
        );
        // Name-input sanity check: warn if the crawled site names a different company.
        if (!wasUrl && enrichment.siteName) {
          const a = companyName.toLowerCase().replace(/[^a-z0-9]/g, "");
          const b = enrichment.siteName.toLowerCase().replace(/[^a-z0-9]/g, "");
          if (a && b && !a.includes(b.slice(0, 6)) && !b.includes(a.slice(0, 6))) {
            console.warn(`[research] name mismatch: searched "${companyName}" but site says "${enrichment.siteName}"`);
          }
        }

        // 3. Search enrichment (Serper) — skipped gracefully if no key
        let searchSnippets: string[] = [];
        let competitorSnippets: string[] = [];
        let searchSources: string[] = [];
        let knownPhone = resolved.knowledgePhone;
        let knownAddress = resolved.knowledgeAddress;

        if (serperKey) {
          progress("searching", "Searching public sources", "Contact info & competitors");
          try {
            const [pub, comp] = await Promise.all([
              gatherPublicInfo(companyName, serperKey),
              findCompetitorCandidates(companyName, serperKey),
            ]);
            searchSnippets = pub.snippets;
            competitorSnippets = comp.snippets;
            searchSources = [...pub.sources, ...comp.sources];
            knownPhone ??= pub.phone;
            knownAddress ??= pub.address;
            progress("searching", "Public research complete");
          } catch {
            progress("searching", "Search step skipped — using crawl data only");
          }
        } else {
          progress("searching", "No Serper key — skipping search enrichment");
        }

        if (crawlPages.length === 0 && searchSnippets.length === 0) {
          progress("analyzing", "Limited data — analyzing from name", "Results may be lower confidence");
        }

        // 4. AI analysis
        progress("analyzing", "Generating AI insights", `Model: ${model}`);
        const report = await analyzeCompany(
          {
            name: companyName,
            website: resolved.website,
            crawledPages: crawlPages,
            searchSnippets,
            competitorSnippets,
            knownPhone,
            knownAddress,
          },
          openrouterKey,
          model,
          [...crawlSources, ...searchSources, ...resolved.sources],
        );

        // Attach deterministic enrichment (logo/brand/socials).
        report.logo = enrichment.logo;
        report.brandColor = enrichment.brandColor;
        report.socials = enrichment.socials;

        send({ type: "report", report });

        // Emit condensed grounding context for follow-up chat (client holds it).
        const context = [
          `Company: ${report.company.name} (${report.company.website || "no site"})`,
          report.company.summary,
          `Products/Services: ${report.company.products.join(", ")}`,
          `Pain points: ${report.company.painPoints.join(" | ")}`,
          `Competitors: ${report.competitors.map((c) => c.name).join(", ")}`,
          "--- Crawled content ---",
          ...crawlPages.map((p) => `# ${p.title}\n${p.text}`),
          "--- Search snippets ---",
          ...searchSnippets,
        ]
          .filter(Boolean)
          .join("\n\n")
          .slice(0, 12000);
        send({ type: "context", context });

        progress("done", "Research complete");
      } catch (err) {
        send({ type: "error", message: err instanceof Error ? err.message : "Unknown error" });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
