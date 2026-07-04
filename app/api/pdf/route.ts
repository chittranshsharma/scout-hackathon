import { NextRequest, NextResponse } from "next/server";
import { renderReportPdf } from "@/lib/pdf";
import type { Report } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const { report } = (await req.json()) as { report: Report };
    if (!report?.company?.name) {
      return NextResponse.json({ error: "Invalid report" }, { status: 400 });
    }
    const pdf = await renderReportPdf(report);
    const safe = report.company.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${safe}-research-report.pdf"`,
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "PDF generation failed" },
      { status: 500 },
    );
  }
}
