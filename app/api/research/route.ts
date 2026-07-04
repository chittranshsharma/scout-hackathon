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

        // 2. Crawl
        const crawlPages: { url: string; title: string; text: string }[] = [];
        let crawlSources: string[] = [];
        if (resolved.website) {
          progress("crawling", "Crawling website", "Discovering key pages");
          try {
            const result = await crawlSite(resolved.website, (i, total, url) => {
              progress("crawling", `Crawling website (${i}/${total})`, url);
            });
            crawlPages.push(...result.pages);
            crawlSources = result.sources;
            progress("crawling", `Analyzed ${crawlPages.length} page(s)`);
          } catch {
            progress("crawling", "Crawl unavailable — falling back to search");
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
              gatherPublicInfo(resolved.name, serperKey),
              findCompetitorCandidates(resolved.name, serperKey),
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
            name: resolved.name,
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

        send({ type: "report", report });
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
