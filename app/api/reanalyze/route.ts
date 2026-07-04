import { NextRequest, NextResponse } from "next/server";
import { analyzeCompany } from "@/lib/ai";
import { DEFAULT_MODEL, type Report, type Settings } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 90;

// Re-run ONLY the AI analysis against the already-gathered context — no
// re-crawl, no re-search. Lets the user compare models cheaply/fast.
export async function POST(req: NextRequest) {
  try {
    const { report, context, settings } = (await req.json()) as {
      report: Report;
      context: string;
      settings: Settings;
    };
    const openrouterKey = settings?.openrouterKey || process.env.OPENROUTER_API_KEY;
    const groqKey = settings?.groqKey || process.env.GROQ_API_KEY;
    const model = settings?.model || DEFAULT_MODEL;

    if (!openrouterKey && !groqKey) return NextResponse.json({ error: "API key missing." }, { status: 400 });
    if (!report?.company?.name || !context) {
      return NextResponse.json({ error: "Missing report context." }, { status: 400 });
    }

    const fresh = await analyzeCompany(
      {
        name: report.company.name,
        website: report.company.website,
        // Feed the cached research context as a single synthetic page.
        crawledPages: [{ url: report.company.website || "", title: "Research context", text: context }],
        searchSnippets: [],
        competitorSnippets: [],
        knownPhone: report.company.phone,
        knownAddress: report.company.address,
      },
      { openrouterKey, groqKey },
      model,
      report.sources,
    );

    // Preserve deterministic enrichment (unchanged by re-analysis).
    fresh.logo = report.logo;
    fresh.brandColor = report.brandColor;
    fresh.socials = report.socials;
    fresh.sources = report.sources;

    return NextResponse.json(fresh);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Re-analysis failed" },
      { status: 500 },
    );
  }
}
