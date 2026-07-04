import { DEFAULT_MODEL, type Report } from "./types";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

export type AnalyzeInput = {
  name: string;
  website?: string;
  crawledPages: { url: string; title: string; text: string }[];
  searchSnippets: string[];
  competitorSnippets: string[];
  knownPhone?: string;
  knownAddress?: string;
};

const SYSTEM_PROMPT = `You are a precise company research analyst. You are given raw text crawled from a company's website plus web-search snippets. Extract and infer accurate company intelligence.

Rules:
- Use ONLY information supported by the provided context. Do not invent phone numbers, addresses, or URLs.
- If a field is unknown, use an empty string (for phone/address) or an empty array.
- painPoints are business/operational challenges THIS company likely faces (market pressure, scaling, competition, differentiation) — inferred, insightful, specific. Not generic.
- competitors must be real companies in the same industry/market. Provide a plausible official website (homepage URL) for each. 3-6 competitors.
- summary: 2-4 sentence professional overview.
- products: concrete products/services offered.

Respond with ONLY a JSON object, no markdown, matching exactly:
{
  "name": string,
  "phone": string,
  "address": string,
  "summary": string,
  "products": string[],
  "painPoints": string[],
  "competitors": [{ "name": string, "website": string }]
}`;

function buildUserPrompt(input: AnalyzeInput): string {
  const pageBlocks = input.crawledPages
    .map((p, i) => `### PAGE ${i + 1}: ${p.title} (${p.url})\n${p.text}`)
    .join("\n\n");
  const search = input.searchSnippets.length
    ? input.searchSnippets.map((s) => `- ${s}`).join("\n")
    : "(none)";
  const comps = input.competitorSnippets.length
    ? input.competitorSnippets.map((s) => `- ${s}`).join("\n")
    : "(none)";

  return `COMPANY: ${input.name}
WEBSITE: ${input.website || "(unknown)"}
KNOWN PHONE (from search, may be empty): ${input.knownPhone || ""}
KNOWN ADDRESS (from search, may be empty): ${input.knownAddress || ""}

=== CRAWLED WEBSITE CONTENT ===
${pageBlocks || "(no website content available)"}

=== WEB SEARCH SNIPPETS ===
${search}

=== COMPETITOR SEARCH SNIPPETS ===
${comps}

Produce the JSON now.`;
}

type ORResponse = {
  choices?: { message?: { content?: string } }[];
  error?: { message?: string };
};

async function callOpenRouter(
  messages: { role: string; content: string }[],
  model: string,
  key: string,
): Promise<string> {
  const res = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://company-research-assistant.vercel.app",
      "X-Title": "AI Company Research Assistant",
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.4,
      max_tokens: 2000,
      response_format: { type: "json_object" },
    }),
    signal: AbortSignal.timeout(60000),
  });

  const data: ORResponse = await res.json();
  if (!res.ok || data.error) {
    throw new Error(`OpenRouter error: ${data.error?.message || res.status}`);
  }
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("OpenRouter returned empty response");
  return content;
}

function parseJson(raw: string): Record<string, unknown> {
  // Strip markdown fences / stray text; grab the outermost {...}.
  const cleaned = raw.replace(/```json/gi, "").replace(/```/g, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("No JSON object found");
  return JSON.parse(cleaned.slice(start, end + 1));
}

function toStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.map((x) => (typeof x === "string" ? x : String(x))).filter(Boolean);
}

export async function analyzeCompany(
  input: AnalyzeInput,
  key: string,
  model: string = DEFAULT_MODEL,
  extraSources: string[] = [],
): Promise<Report> {
  const messages = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: buildUserPrompt(input) },
  ];

  let parsed: Record<string, unknown>;
  try {
    parsed = parseJson(await callOpenRouter(messages, model, key));
  } catch {
    // one repair retry: ask model to return strict JSON only
    const repair = [
      ...messages,
      {
        role: "user",
        content:
          "Your previous reply was not valid JSON. Respond again with ONLY the JSON object, no prose, no markdown.",
      },
    ];
    parsed = parseJson(await callOpenRouter(repair, model, key));
  }

  const competitors = Array.isArray(parsed.competitors)
    ? (parsed.competitors as Record<string, unknown>[])
        .map((c) => ({
          name: typeof c?.name === "string" ? c.name : "",
          website: typeof c?.website === "string" ? c.website : "",
        }))
        .filter((c) => c.name)
    : [];

  const allSources = [
    ...new Set([...(input.website ? [input.website] : []), ...input.crawledPages.map((p) => p.url), ...extraSources]),
  ];

  return {
    company: {
      name: (typeof parsed.name === "string" && parsed.name) || input.name,
      website: input.website || "",
      phone: (typeof parsed.phone === "string" && parsed.phone) || input.knownPhone || "",
      address:
        (typeof parsed.address === "string" && parsed.address) || input.knownAddress || "",
      products: toStringArray(parsed.products),
      painPoints: toStringArray(parsed.painPoints),
      summary: typeof parsed.summary === "string" ? parsed.summary : "",
    },
    competitors,
    sources: allSources,
    model,
  };
}
