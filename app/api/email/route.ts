import { NextRequest, NextResponse } from "next/server";
import { draftOutreachEmail } from "@/lib/ai";
import { DEFAULT_MODEL, type Report, type Settings } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const { report, settings } = (await req.json()) as { report: Report; settings: Settings };
    const key = settings?.openrouterKey || process.env.OPENROUTER_API_KEY;
    const model = settings?.model || DEFAULT_MODEL;

    if (!key) return NextResponse.json({ error: "OpenRouter API key missing." }, { status: 400 });
    if (!report?.company?.name) return NextResponse.json({ error: "Invalid report" }, { status: 400 });

    const email = await draftOutreachEmail(report, key, model);
    return NextResponse.json(email);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Email draft failed" },
      { status: 500 },
    );
  }
}
