import { NextRequest, NextResponse } from "next/server";
import { draftOutreachEmail } from "@/lib/ai";
import { DEFAULT_MODEL, type Report, type Settings } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const { report, settings } = (await req.json()) as { report: Report; settings: Settings };
    const openrouterKey = settings?.openrouterKey || process.env.OPENROUTER_API_KEY;
    const groqKey = settings?.groqKey || process.env.GROQ_API_KEY;
    const model = settings?.model || DEFAULT_MODEL;

    if (!openrouterKey && !groqKey) return NextResponse.json({ error: "API key missing." }, { status: 400 });
    if (!report?.company?.name) return NextResponse.json({ error: "Invalid report" }, { status: 400 });

    const email = await draftOutreachEmail(report, { openrouterKey, groqKey }, model);
    return NextResponse.json(email);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Email draft failed" },
      { status: 500 },
    );
  }
}
