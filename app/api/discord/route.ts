import { NextRequest, NextResponse } from "next/server";
import { renderReportPdf } from "@/lib/pdf";
import { sendToDiscord } from "@/lib/discord";
import type { Report, Settings } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const { report, settings } = (await req.json()) as {
      report: Report;
      settings: Settings;
    };

    const botToken = settings.discordBotToken || process.env.DISCORD_BOT_TOKEN;
    const channelId = settings.discordChannelId || process.env.DISCORD_CHANNEL_ID;

    if (!botToken || !channelId) {
      return NextResponse.json(
        { error: "Discord bot token or channel ID not configured." },
        { status: 400 },
      );
    }
    if (!report?.company?.name) {
      return NextResponse.json({ error: "Invalid report" }, { status: 400 });
    }

    const pdf = await renderReportPdf(report);
    await sendToDiscord({
      botToken,
      channelId,
      applicantName: settings.applicantName,
      applicantEmail: settings.applicantEmail,
      report,
      pdf: new Uint8Array(pdf),
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Discord send failed" },
      { status: 500 },
    );
  }
}
