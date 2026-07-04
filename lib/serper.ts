// Serper.dev search helpers.
// Docs: https://serper.dev — POST https://google.serper.dev/search { q }

const SERPER_URL = "https://google.serper.dev/search";

type OrganicResult = { title: string; link: string; snippet?: string };
type SerperResponse = {
  organic?: OrganicResult[];
  knowledgeGraph?: {
    title?: string;
    website?: string;
    description?: string;
    attributes?: Record<string, string>;
    phone?: string;
    address?: string;
  };
  answerBox?: { answer?: string; snippet?: string };
};

// Hosts that are never a company's own official site.
const NON_OFFICIAL = [
  "wikipedia.org", "linkedin.com", "facebook.com", "twitter.com", "x.com",
  "instagram.com", "youtube.com", "crunchbase.com", "bloomberg.com",
  "glassdoor.com", "indeed.com", "reddit.com", "medium.com", "github.com",
  "apps.apple.com", "play.google.com", "g2.com", "capterra.com",
  "trustpilot.com", "yelp.com", "pitchbook.com", "zoominfo.com",
];

export async function serperSearch(
  query: string,
  key: string,
  num = 10,
): Promise<SerperResponse> {
  const res = await fetch(SERPER_URL, {
    method: "POST",
    headers: { "X-API-KEY": key, "Content-Type": "application/json" },
    body: JSON.stringify({ q: query, num }),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`Serper ${res.status}: ${await res.text()}`);
  return res.json();
}

function hostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function isOfficialCandidate(link: string): boolean {
  const host = hostname(link);
  if (!host) return false;
  return !NON_OFFICIAL.some((bad) => host === bad || host.endsWith(`.${bad}`));
}

// Resolve a company name to its most likely official website.
export async function findOfficialWebsite(
  name: string,
  key: string,
): Promise<{ website?: string; knowledge?: SerperResponse["knowledgeGraph"]; sources: string[] }> {
  const data = await serperSearch(`${name} official website`, key, 10);
  const sources: string[] = [];

  // Prefer knowledge graph website when present.
  const kgSite = data.knowledgeGraph?.website;
  if (kgSite && isOfficialCandidate(kgSite)) {
    sources.push(kgSite);
    return { website: normalizeUrl(kgSite), knowledge: data.knowledgeGraph, sources };
  }

  for (const r of data.organic ?? []) {
    if (isOfficialCandidate(r.link)) {
      sources.push(r.link);
      return { website: normalizeUrl(r.link), knowledge: data.knowledgeGraph, sources };
    }
  }
  return { knowledge: data.knowledgeGraph, sources };
}

// Gather supporting public info + contact snippets for a company.
export async function gatherPublicInfo(
  name: string,
  key: string,
): Promise<{ snippets: string[]; sources: string[]; phone?: string; address?: string }> {
  const snippets: string[] = [];
  const sources: string[] = [];
  let phone: string | undefined;
  let address: string | undefined;

  const queries = [`${name} company overview`, `${name} headquarters contact phone address`];
  for (const q of queries) {
    try {
      const data = await serperSearch(q, key, 6);
      if (data.knowledgeGraph?.phone) phone ??= data.knowledgeGraph.phone;
      if (data.knowledgeGraph?.address) address ??= data.knowledgeGraph.address;
      if (data.answerBox?.snippet) snippets.push(data.answerBox.snippet);
      for (const r of data.organic ?? []) {
        if (r.snippet) snippets.push(`${r.title}: ${r.snippet}`);
        sources.push(r.link);
      }
    } catch {
      // best-effort enrichment; ignore individual query failures
    }
  }
  return { snippets: snippets.slice(0, 12), sources: [...new Set(sources)].slice(0, 8), phone, address };
}

// Find competitor candidates via search (AI still refines/validates these).
export async function findCompetitorCandidates(
  name: string,
  key: string,
): Promise<{ snippets: string[]; sources: string[] }> {
  const snippets: string[] = [];
  const sources: string[] = [];
  try {
    const data = await serperSearch(`${name} competitors and alternatives`, key, 10);
    if (data.answerBox?.snippet) snippets.push(data.answerBox.snippet);
    for (const r of data.organic ?? []) {
      if (r.snippet) snippets.push(`${r.title}: ${r.snippet}`);
      sources.push(r.link);
    }
  } catch {
    // ignore
  }
  return { snippets: snippets.slice(0, 10), sources: [...new Set(sources)].slice(0, 6) };
}

export function normalizeUrl(input: string): string {
  let u = input.trim();
  if (!/^https?:\/\//i.test(u)) u = `https://${u}`;
  try {
    const url = new URL(u);
    return url.origin + (url.pathname === "/" ? "" : url.pathname);
  } catch {
    return u;
  }
}
