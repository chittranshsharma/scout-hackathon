import type { Report } from "./types";

const DISCORD_API = "https://discord.com/api/v10";

export type DiscordPayload = {
  botToken: string;
  channelId: string;
  applicantName?: string;
  applicantEmail?: string;
  report: Report;
  pdf: Uint8Array;
};

// Send a research report + PDF attachment to a Discord channel via bot.
export async function sendToDiscord(p: DiscordPayload): Promise<void> {
  const c = p.report.company;
  const embed = {
    title: `📊 Company Research: ${c.name}`,
    color: 0x5865f2,
    fields: [
      { name: "Applicant", value: p.applicantName || "—", inline: true },
      { name: "Email", value: p.applicantEmail || "—", inline: true },
      { name: "Company", value: c.name || "—", inline: false },
      { name: "Website", value: c.website || "—", inline: false },
    ],
    footer: { text: `Model: ${p.report.model}` },
    timestamp: new Date().toISOString(),
  };

  const form = new FormData();
  form.append(
    "payload_json",
    JSON.stringify({
      content: "New company research report generated.",
      embeds: [embed],
    }),
  );

  const safeName = (c.name || "company").replace(/[^a-z0-9]+/gi, "-").toLowerCase();
  const blob = new Blob([p.pdf as BlobPart], { type: "application/pdf" });
  form.append("files[0]", blob, `${safeName}-research-report.pdf`);

  const res = await fetch(`${DISCORD_API}/channels/${p.channelId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bot ${p.botToken}` },
    body: form,
    signal: AbortSignal.timeout(30000),
  });

  if (!res.ok) {
    throw new Error(`Discord ${res.status}: ${await res.text()}`);
  }
}
