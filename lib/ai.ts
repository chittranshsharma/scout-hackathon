import { DEFAULT_MODEL, type ConfidenceTier, type OutreachEmail, type Report } from "./types";

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

const SYSTEM_PROMPT = `You are a precise company-research analyst. You are given raw text crawled from a company's website plus web-search snippets. Your job is to EXTRACT facts from that context — not to recall or guess.

ABSOLUTE RULES (violating these makes the report worthless):
- Use ONLY information explicitly present in the provided context. Do NOT use prior knowledge about the company.
- Do NOT infer or invent phone numbers, addresses, emails, or URLs. If phone/address is not literally written in the context, return an empty string "". A wrong number is far worse than a blank.
- Never fabricate a fact to fill a field. When uncertain, omit it.
- "phone": copy the exact phone string from the context, or "".
- "address": copy the exact address from the context, or "".
- "summary": 2-4 sentences, strictly paraphrasing what the context says the company does. No embellishment.
- "products": concrete products/services named in the context. Empty array if none stated.
- "painPoints": business/operational challenges this company plausibly faces. These are interpretive, but each MUST be grounded in evidence from the context (their market, product, scale, competition as described) — not generic filler. 3-5 points.
- "competitors": REAL companies in the same industry/market, 3-6 of them, each with its real homepage URL. Only include competitors you are confident actually exist. Prefer ones mentioned in the competitor snippets.

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
  choices?: { message?: { content?: string; reasoning?: string } }[];
  error?: { message?: string };
};

async function callOpenRouter(
  messages: { role: string; content: string }[],
  model: string,
  key: string,
  useJsonMode = true,
): Promise<string> {
  const body: Record<string, unknown> = {
    model,
    messages,
    temperature: 0.4,
    max_tokens: 2000,
  };
  // Not every free model supports structured-output mode; we retry without it.
  if (useJsonMode) body.response_format = { type: "json_object" };

  const res = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://company-research-assistant.vercel.app",
      "X-Title": "AI Company Research Assistant",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60000),
  });

  const data: ORResponse = await res.json();
  if (!res.ok || data.error) {
    const msg = data.error?.message || `HTTP ${res.status}`;
    // A model that rejects response_format → retry once without JSON mode.
    if (useJsonMode && /response_format|json|not support|invalid/i.test(msg)) {
      return callOpenRouter(messages, model, key, false);
    }
    throw new Error(`OpenRouter error: ${msg}`);
  }
  const m = data.choices?.[0]?.message;
  // Reasoning models may leave `content` empty and put text in `reasoning`.
  const content = m?.content || m?.reasoning || "";
  if (!content) throw new Error("OpenRouter returned empty response");
  return content;
}

function parseJson(raw: string): Record<string, unknown> {
  // Strip chain-of-thought / harmony tags / code fences some models emit.
  const cleaned = raw
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/<\|[^|]*\|>/g, "")
    .replace(/```json/gi, "")
    .replace(/```/g, "")
    .trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("No JSON object found");
  // Try progressively shorter tails in case of trailing junk after the object.
  const candidate = cleaned.slice(start, end + 1);
  try {
    return JSON.parse(candidate);
  } catch {
    // Recover from trailing commas / minor issues.
    const repaired = candidate.replace(/,(\s*[}\]])/g, "$1");
    return JSON.parse(repaired);
  }
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

  // The concatenated source text — the ONLY thing a fact may be verified against.
  const sourceText = [
    ...input.crawledPages.map((p) => p.text),
    ...input.searchSnippets,
    input.knownPhone || "",
    input.knownAddress || "",
  ]
    .join("\n")
    .toLowerCase();

  let parsed: Record<string, unknown>;
  let actualModel = model;
  try {
    const r = await callWithFallback(messages, model, key);
    actualModel = r.actualModel;
    parsed = parseJson(r.content);
  } catch {
    try {
      // Repair retry: force strict JSON only.
      const repair = [
        ...messages,
        {
          role: "user",
          content:
            "Your previous reply was not valid JSON. Output ONLY the JSON object — start with { and end with }. No prose, no markdown, no explanation.",
        },
      ];
      const r = await callWithFallback(repair, model, key);
      actualModel = r.actualModel;
      parsed = parseJson(r.content);
    } catch {
      // Final safety net: never hard-fail. Return a degraded report built from
      // the raw crawl/search text so the user still gets a usable dossier.
      const firstText = input.crawledPages[0]?.text || input.searchSnippets.join(" ");
      parsed = {
        name: input.name,
        summary: firstText
          ? firstText.slice(0, 400).trim()
          : "AI analysis unavailable for this model — try another model from Settings or the Compare-model control.",
        products: [],
        painPoints: [],
        competitors: [],
      };
    }
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

  // Anti-hallucination: only keep phone/address if the value actually appears
  // in the source text. A blank is safer than an invented contact detail.
  const rawPhone = (typeof parsed.phone === "string" && parsed.phone) || input.knownPhone || "";
  const rawAddress = (typeof parsed.address === "string" && parsed.address) || input.knownAddress || "";
  const phone = phoneInSource(rawPhone, sourceText) ? rawPhone : "";
  const address = addressInSource(rawAddress, sourceText) ? rawAddress : "";

  const confidence = computeConfidence(input);
  // If a contact detail was rejected as unverified, never mark it high-confidence.
  if (!phone && rawPhone) confidence.contact = "inferred";

  return {
    company: {
      name: (typeof parsed.name === "string" && parsed.name) || input.name,
      website: input.website || "",
      phone,
      address,
      products: toStringArray(parsed.products),
      painPoints: toStringArray(parsed.painPoints),
      summary: typeof parsed.summary === "string" ? parsed.summary : "",
    },
    competitors,
    sources: allSources,
    model: actualModel,
    confidence,
  };
}

// Try the chosen model; on any failure fall back once to the stable default,
// reporting which model actually produced the answer.
async function callWithFallback(
  messages: { role: string; content: string }[],
  model: string,
  key: string,
): Promise<{ content: string; actualModel: string }> {
  try {
    return { content: await callOpenRouter(messages, model, key), actualModel: model };
  } catch (e) {
    if (model !== DEFAULT_MODEL) {
      return { content: await callOpenRouter(messages, DEFAULT_MODEL, key), actualModel: DEFAULT_MODEL };
    }
    throw e;
  }
}

// Verify a phone number appears in source by comparing digit sequences.
function phoneInSource(phone: string, sourceLower: string): boolean {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 7) return false;
  const srcDigits = sourceLower.replace(/\D/g, "");
  // Match on the last 7 digits (ignores country-code / formatting differences).
  return srcDigits.includes(digits.slice(-9)) || srcDigits.includes(digits.slice(-7));
}

// Verify an address by requiring a distinctive token from it to appear in source.
function addressInSource(address: string, sourceLower: string): boolean {
  if (!address) return false;
  const tokens = address.toLowerCase().match(/[a-z0-9]{4,}/g) || [];
  if (!tokens.length) return false;
  const hits = tokens.filter((t) => sourceLower.includes(t)).length;
  // Require most address tokens to be present — guards against invented streets.
  return hits >= Math.max(2, Math.ceil(tokens.length * 0.5));
}

// Self-audit: rate how well each report section is backed by real evidence.
// crawled pages + matching search snippets = independent sources.
function computeConfidence(input: AnalyzeInput): Record<string, ConfidenceTier> {
  const pages = input.crawledPages.length;
  const search = input.searchSnippets.length;
  const comp = input.competitorSnippets.length;
  const tier = (n: number): ConfidenceTier => (n >= 3 ? "high" : n >= 1 ? "moderate" : "inferred");
  return {
    // Summary & products come straight from the site + public snippets.
    summary: tier(pages + search),
    products: tier(pages),
    // Pain points are AI-reasoned, never directly sourced.
    painPoints: "inferred",
    // Competitors are seeded by dedicated competitor search.
    competitors: comp > 0 ? tier(comp) : "inferred",
  };
}

const EMAIL_PROMPT = `You are an SDR at Relu Consultancy, an AI & automation consulting firm. Write a concise, professional cold outreach email to the company below. Anchor the pitch on ONE of their detected pain points and how AI/automation consulting could address it. Rules:
- 110-150 words in the body. No fluff, no "I hope this finds you well".
- Specific to this company — reference their actual product/pain point.
- Confident, human, not salesy. One clear CTA (a short call).
- Return ONLY JSON: { "subject": string, "body": string }. Body may use \\n for line breaks.`;

export async function draftOutreachEmail(
  report: Report,
  key: string,
  model: string = DEFAULT_MODEL,
): Promise<OutreachEmail> {
  const c = report.company;
  const userMsg = `Company: ${c.name}
Website: ${c.website || "unknown"}
Summary: ${c.summary}
Products/Services: ${c.products.join(", ")}
Pain points: ${c.painPoints.map((p) => `- ${p}`).join("\n")}`;

  const messages = [
    { role: "system", content: EMAIL_PROMPT },
    { role: "user", content: userMsg },
  ];

  let parsed: Record<string, unknown>;
  try {
    parsed = parseJson(await callOpenRouter(messages, model, key));
  } catch {
    const repair = [
      ...messages,
      { role: "user", content: "Respond again with ONLY the JSON object { subject, body }." },
    ];
    parsed = parseJson(await callOpenRouter(repair, model, key));
  }
  return {
    subject: typeof parsed.subject === "string" ? parsed.subject : `Helping ${c.name} with AI & automation`,
    body: typeof parsed.body === "string" ? parsed.body : "",
  };
}
