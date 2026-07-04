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
  const groqKey = settings.groqKey || process.env.GROQ_API_KEY;
  const serperKey = settings.serperKey || process.env.SERPER_API_KEY;
  const model = settings.model || DEFAULT_MODEL;

  const stream = new ReadableStream({
    async start(controller) {
      const send = (e: StreamEvent) => controller.enqueue(sseEncode(e));
      const progress = (stage: ProgressStage, message: string, detail?: string) =>
        send({ type: "progress", stage, message, detail });

      try {
        if (!input) throw new Error("No company name or URL provided.");
        if (!openrouterKey && !groqKey)
          throw new Error("OpenRouter or Groq API key missing. Add one in Config settings.");

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
        const t0 = Date.now();

        // 2 + 3. Crawl and Serper run CONCURRENTLY — they're independent.
        // Serper uses the resolved name (good for name input; host-slug for URL
        // input is fine for search). The canonical report name is refined from
        // the crawl's og:site_name afterwards.
        progress("crawling", "Crawling website & searching sources", resolved.website || "public sources");

        const crawlPromise = resolved.website
          ? crawlSite(resolved.website, (i, total, url) => progress("crawling", `Crawling website (${i}/${total})`, url)).catch(() => null)
          : Promise.resolve(null);
        const serperPromise =
          serperKey
            ? Promise.all([
                gatherPublicInfo(resolved.name, serperKey).catch(() => null),
                findCompetitorCandidates(resolved.name, serperKey).catch(() => null),
              ])
            : Promise.resolve([null, null] as const);

        const [crawlResult, [pub, comp]] = await Promise.all([crawlPromise, serperPromise]);
        const tCrawlSearch = Date.now();

        const crawlPages = crawlResult?.pages ?? [];
        const crawlSources = crawlResult?.sources ?? [];
        const enrichment: import("@/lib/crawl").Enrichment = crawlResult?.enrichment ?? { socials: [] };
        const searchSnippets = pub?.snippets ?? [];
        const competitorSnippets = comp?.snippets ?? [];
        const searchSources = [...(pub?.sources ?? []), ...(comp?.sources ?? [])];
        const knownPhone = resolved.knowledgePhone ?? pub?.phone;
        const knownAddress = resolved.knowledgeAddress ?? pub?.address;
        progress("searching", `Gathered ${crawlPages.length} page(s) + ${searchSnippets.length} snippet(s)`);

        // Canonical company name: for URL input, trust the site's own declared
        // name (og:site_name / <title>) over the host slug. For name input,
        // trust the Serper knowledge-graph name from resolution.
        const companyName = wasUrl ? enrichment.siteName || resolved.name : resolved.name;
        console.log(
          `[research] input=${JSON.stringify(input)} wasUrl=${wasUrl} resolvedDomain=${resolved.website || "-"} extractedName=${JSON.stringify(companyName)}`,
        );

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
          { openrouterKey, groqKey },
          model,
          [...crawlSources, ...searchSources, ...resolved.sources],
        );
        const tAI = Date.now();
        console.log(
          `[timing] crawl+search=${tCrawlSearch - t0}ms ai=${tAI - tCrawlSearch}ms total=${tAI - t0}ms model=${report.model}`,
        );

        // Attach deterministic enrichment (logo/brand/socials/sitemap).
        report.logo = enrichment.logo;
        report.brandColor = enrichment.brandColor;
        report.socials = enrichment.socials;
        report.sitemap = enrichment.sitemap;

        send({ type: "report", report });

        // Emit condensed grounding context for follow-up chat + reanalyze.
        // Compact report summary first, then abbreviated crawl text for reanalyze
        // quality — capped at 3000 chars to cut token waste.
        const context = [
          `Company: ${report.company.name} (${report.company.website || "no site"})`,
          report.company.summary,
          `Products/Services: ${report.company.products.join(", ")}`,
          `Pain points: ${report.company.painPoints.join(" | ")}`,
          `Competitors: ${report.competitors.map((c) => c.name).join(", ")}`,
          ...crawlPages.slice(0, 3).map((p) => `# ${p.title}\n${p.text.slice(0, 600)}`),
          ...searchSnippets.slice(0, 4),
        ]
          .filter(Boolean)
          .join("\n\n")
          .slice(0, 3000);
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
