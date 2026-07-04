import { DEFAULT_MODEL, MODEL_OPTIONS, type ConfidenceTier, type OutreachEmail, type Report } from "./types";

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
- "competitors": REAL companies in the same industry/market, 3-5 of them, each with its real homepage URL. Only include competitors you are confident actually exist. Prefer ones mentioned in the competitor snippets.
- "competitorMatrix": compare the target company to the top 3-5 competitors. Use the provided snippets where possible. For well-known competitors, you may use established industry facts to describe their target audience, core strengths, and general pricing models (e.g. value-based, premium, subscription). Do NOT fabricate specific pricing numbers (e.g. "$50,000") or speculative data. If a competitor is obscure or lacks public info, write "Not publicly disclosed".

Respond with ONLY a JSON object, no markdown, matching exactly:
{
  "name": string,
  "phone": string,
  "address": string,
  "summary": string,
  "products": string[],
  "painPoints": string[],
  "competitors": [{ "name": string, "website": string }],
  "competitorMatrix": [{ "name": string, "audience": string, "coreStrength": string, "pricingModel": string }]
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

async function callLLM(
  messages: { role: string; content: string }[],
  model: string,
  keys: { openrouterKey?: string; groqKey?: string },
  useJsonMode = true,
  maxTokens = 2000,
): Promise<string> {
  const isGroq = model.startsWith("groq:");
  const actualModel = isGroq ? model.replace("groq:", "") : model;
  const url = isGroq ? "https://api.groq.com/openai/v1/chat/completions" : OPENROUTER_URL;
  const authKey = isGroq ? keys.groqKey : keys.openrouterKey;

  if (!authKey) throw new Error(`Missing API key for ${isGroq ? "Groq" : "OpenRouter"}`);

  const body: Record<string, unknown> = {
    model: actualModel,
    messages,
    temperature: 0.4,
    max_tokens: maxTokens,
  };
  if (useJsonMode) body.response_format = { type: "json_object" };

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${authKey}`,
      "Content-Type": "application/json",
      ...(isGroq ? {} : {
        "HTTP-Referer": "https://company-research-assistant.vercel.app",
        "X-Title": "AI Company Research Assistant",
      }),
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(45000),
  });

  const data: ORResponse = await res.json();
  if (!res.ok || data.error) {
    const msg = data.error?.message || `HTTP ${res.status}`;
    if (useJsonMode && /response_format|json|not support|invalid/i.test(msg)) {
      return callLLM(messages, model, keys, false, maxTokens);
    }
    throw new Error(`${isGroq ? "Groq" : "OpenRouter"} error: ${msg}`);
  }
  const m = data.choices?.[0]?.message;
  const content = m?.content || m?.reasoning || "";
  if (!content) throw new Error(`${isGroq ? "Groq" : "OpenRouter"} returned empty response`);
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
  keys: { openrouterKey?: string; groqKey?: string },
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
    const r = await callWithFallback(messages, model, keys);
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
      const r = await callWithFallback(repair, model, keys);
      actualModel = r.actualModel;
      parsed = parseJson(r.content);
    } catch {
      // Final safety net: never hard-fail. Return a degraded report built from
      // the raw crawl/search text so the user still gets a usable dossier.
      const firstText = input.crawledPages[0]?.text || input.searchSnippets.join(" ");
      parsed = {
        name: input.name,
        summary: "⚠️ AI analysis failed for this model (invalid output or timeout). Please click 'Regenerate' or switch to the Recommended model (Llama 3.3 70B) in the Compare dropdown below.",
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

  const competitorMatrix = Array.isArray(parsed.competitorMatrix)
    ? (parsed.competitorMatrix as Record<string, unknown>[])
        .map((c) => ({
          name: typeof c?.name === "string" ? c.name : "",
          audience: typeof c?.audience === "string" ? c.audience : "Unknown",
          coreStrength: typeof c?.coreStrength === "string" ? c.coreStrength : "Unknown",
          pricingModel: typeof c?.pricingModel === "string" ? c.pricingModel : "Unknown",
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
    competitorMatrix,
    sources: allSources,
    model: actualModel,
    confidence,
  };
}

// Free models rate-limit (429) per upstream provider. Try the chosen model
// first, then walk the OTHER free models — each routes to a different provider,
// so one is almost always available. Reports which model actually answered.
async function callWithFallback(
  messages: { role: string; content: string }[],
  model: string,
  keys: { openrouterKey?: string; groqKey?: string },
  maxTokens = 2000,
): Promise<{ content: string; actualModel: string }> {
  // If user provided a groqKey, insert groq models near the front of the fallback chain
  // so if OpenRouter hits a 429 rate limit, it fails over to Groq immediately!
  const defaultChain = MODEL_OPTIONS.map((m) => m.id);
  const chain = [model, ...defaultChain.filter((id) => id !== model)];
  
  if (keys.groqKey && !model.startsWith("groq:")) {
    chain.splice(1, 0, "groq:openai/gpt-oss-120b", "groq:qwen/qwen3.6-27b");
  }

  let lastErr: unknown;
  for (const mdl of Array.from(new Set(chain))) {
    try {
      // Skip models if their respective key isn't provided
      if (mdl.startsWith("groq:") && !keys.groqKey) continue;
      if (!mdl.startsWith("groq:") && !keys.openrouterKey) continue;

      return { content: await callLLM(messages, mdl, keys, true, maxTokens), actualModel: mdl };
    } catch (e) {
      lastErr = e;
      // rate-limited or provider error → immediately try the next model
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("All models failed");
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

const BANNED_PHRASES = [
  "I hope this email finds you well",
  "I hope this finds you well",
  "I wanted to reach out",
  "In today's fast-paced world",
  "at the end of the day",
  "circle back",
  "leverage",
  "synergy",
  "unlock potential",
  "unlock your potential",
  "game-changer",
  "game changer",
  "cutting-edge",
  "cutting edge",
  "seamless",
  "seamlessly",
  "revolutionize",
  "dive into",
  "take it to the next level",
  "in this day and age",
  "streamline",
  "robust",
  "harness",
  "empower",
  "elevate",
  "landscape",
  "ecosystem",
  "holistic",
  "best-in-class",
  "state-of-the-art",
];

const EMAIL_PROMPT = `You write cold outreach emails for Relu Consultancy, an AI and automation consulting firm. Write like a real person sending a quick email, not like a marketer.

HARD RULES:
- Never use em-dashes or en-dashes. Use periods, commas, or "and".
- Never use these words/phrases: "I hope this email finds you well", "I wanted to reach out", "leverage", "synergy", "seamless", "cutting-edge", "game-changer", "revolutionize", "dive into", "unlock potential", "circle back", "in today's fast-paced world".
- Body is 80 to 100 words. Short sentences. No paragraph longer than 2 sentences. Contractions are good ("we're", "don't").
- Open with something specific to THIS company (a product or a real pain point), not a greeting about yourself.
- One clear ask at the end: a short call.
- Subject line is short and specific, no clickbait.
- WRITE THE ACTUAL EMAIL. Do not output placeholders, schemas, or "..." dummy text.

Here is the tone to match:
Subject: Question about scaling VideoSDK's support
Body: Hi team, I saw VideoSDK powers real-time video for developers. As usage grows, support volume and reliability tend to pile up fast. We help teams automate that with AI, so response times drop without more headcount. Would a quick 15-minute call next week be worth it? Thanks, Relu Consultancy

Return ONLY JSON: { "subject": string, "body": string }. Body may use \\n for line breaks.`;

// Hard safety net on top of the prompt: strip dashes and any banned phrase
// that slips through, so email output never reads AI-generated.
function sanitizeEmail(text: string): string {
  let t = text.replace(/\s*[—–]\s*/g, ", "); // em/en dash → comma
  t = t.replace(/--/g, ", "); // double-hyphen (dash alternative) → comma
  for (const p of BANNED_PHRASES) {
    t = t.replace(new RegExp(p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"), "");
  }
  // Cap exclamation marks at 1 max in the body (keeps tone natural, not flat).
  let bangCount = 0;
  t = t.replace(/!/g, () => (++bangCount <= 1 ? "!" : "."));
  return t
    .replace(/ ,/g, ",")
    .replace(/,\s*,/g, ",")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([.,!?])/g, "$1")
    .replace(/\.\s*\./g, ".")
    .trim();
}

export async function draftOutreachEmail(
  report: Report,
  keys: { openrouterKey?: string; groqKey?: string },
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
    parsed = parseJson((await callWithFallback(messages, model, keys, 2000)).content);
    if (typeof parsed.subject !== "string" || parsed.subject.replace(/\./g, "").trim().length < 3) throw new Error("Invalid subject");
    if (typeof parsed.body !== "string" || parsed.body.replace(/\./g, "").trim().length < 10) throw new Error("Invalid body");
  } catch (err) {
    const repair = [
      ...messages,
      { role: "user", content: "Respond again with ONLY the JSON object { subject, body }." },
    ];
    parsed = parseJson((await callWithFallback(repair, model, keys, 2000)).content);
    if (typeof parsed.subject !== "string" || parsed.subject.replace(/\./g, "").trim().length < 3) throw new Error("Invalid subject");
    if (typeof parsed.body !== "string" || parsed.body.replace(/\./g, "").trim().length < 10) throw new Error("Invalid body");
  }
  return {
    subject: sanitizeEmail(typeof parsed.subject === "string" ? parsed.subject : `A quick idea for ${c.name}`),
    body: sanitizeEmail(typeof parsed.body === "string" ? parsed.body : ""),
  };
}
