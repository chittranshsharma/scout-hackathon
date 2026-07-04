import * as cheerio from "cheerio";
import type { Social } from "./types";

export type CrawledPage = { url: string; title: string; text: string };
export type Enrichment = {
  logo?: string;
  brandColor?: string;
  socials: Social[];
  // Company name as the site itself declares it (og:site_name / <title>).
  siteName?: string;
};
export type CrawlResult = { pages: CrawledPage[]; sources: string[]; enrichment: Enrichment };

const MAX_PAGES = 6;
const PER_PAGE_TIMEOUT = 5000; // slow pages are usually dead weight
const CONCURRENCY = 5; // parallel internal-page fetches
const MAX_TEXT_PER_PAGE = 2000; // chars sent to AI per page (relevance-ranked)
const UA =
  "Mozilla/5.0 (compatible; CompanyResearchBot/1.0; +https://example.com/bot)";

// Keyword score for prioritizing which internal links to crawl.
const PAGE_KEYWORDS: Record<string, number> = {
  about: 10, "about-us": 10, company: 8,
  product: 9, products: 9, service: 9, services: 9, solution: 8, solutions: 8,
  platform: 6, features: 6, pricing: 8, plans: 6,
  contact: 9, "contact-us": 9, support: 4,
  industries: 5, "use-cases": 5, "what-we-do": 7, overview: 6,
};

// Path fragments we never crawl.
const SKIP_FRAGMENTS = [
  "login", "signin", "sign-in", "signup", "sign-up", "register", "auth",
  "cart", "checkout", "account", "password", "logout", "privacy", "terms",
  "cookie", "legal", "careers", "jobs", "blog", "news", "press", "wp-admin",
  "#", "mailto:", "tel:", "javascript:", ".pdf", ".jpg", ".png", ".zip", ".mp4",
];

// Returns cleaned HTML + the final URL after redirects (so the crawler scopes
// links against the real domain, e.g. after http→https or www→apex redirects).
async function fetchPage(url: string): Promise<{ html: string; finalUrl: string } | null> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "text/html" },
      signal: AbortSignal.timeout(PER_PAGE_TIMEOUT),
      redirect: "follow",
    });
    const ct = res.headers.get("content-type") || "";
    if (!res.ok || !ct.includes("text/html")) return null;
    return { html: await res.text(), finalUrl: res.url || url };
  } catch {
    return null;
  }
}

// Terms that signal a paragraph is relevant to company research.
const RELEVANCE_TERMS =
  /\b(product|service|solution|platform|pricing|plan|price|customer|client|feature|offer|provide|build|help|company|founded|headquarter|mission|team|industr|enterprise|API|integrat|tool|software|payment|data|manage|automat)/i;

function scoreParagraph(p: string): number {
  const matches = p.match(new RegExp(RELEVANCE_TERMS, "gi"));
  return (matches ? matches.length : 0) + Math.min(p.length / 300, 1);
}

// Extract deduped, relevance-ranked paragraphs. `globalSeen` dedupes repeated
// boilerplate ACROSS pages (nav/CTA text that survives element stripping).
function extract($: cheerio.CheerioAPI, globalSeen: Set<string>): { title: string; text: string } {
  $("script, style, noscript, svg, nav, footer, header, form, iframe, template").remove();
  // Strip cookie/consent/ad banners so their boilerplate doesn't pollute AI input.
  $(
    '[id*="cookie" i], [class*="cookie" i], [id*="consent" i], [class*="consent" i], [class*="banner" i], [id*="gdpr" i], [class*="gdpr" i], [aria-label*="cookie" i], [role="dialog"]',
  ).remove();
  const title = $("title").first().text().trim() || $("h1").first().text().trim();

  const parts: string[] = [];
  $("h1, h2, h3, p, li").each((_, el) => {
    const t = $(el).text().replace(/\s+/g, " ").trim();
    if (t.length < 25) return;
    const key = t.slice(0, 120).toLowerCase();
    if (globalSeen.has(key)) return; // cross-page duplicate
    globalSeen.add(key);
    parts.push(t);
  });

  // Rank by relevance, keep the top paragraphs up to the char budget.
  const ranked = parts
    .map((p) => ({ p, s: scoreParagraph(p) }))
    .sort((a, b) => b.s - a.s);
  const kept: string[] = [];
  let used = 0;
  for (const { p } of ranked) {
    if (used + p.length > MAX_TEXT_PER_PAGE) continue;
    kept.push(p);
    used += p.length + 1;
    if (used >= MAX_TEXT_PER_PAGE) break;
  }
  return { title, text: kept.join("\n") };
}

const SOCIAL_HOSTS: [string, RegExp][] = [
  ["LinkedIn", /linkedin\.com\/(company|in|school)\//i],
  ["X", /(twitter|x)\.com\/[A-Za-z0-9_]+/i],
  ["Facebook", /facebook\.com\/[A-Za-z0-9.]+/i],
  ["Instagram", /instagram\.com\/[A-Za-z0-9_.]+/i],
  ["YouTube", /youtube\.com\/(c\/|channel\/|@|user\/)?[A-Za-z0-9_-]+/i],
  ["GitHub", /github\.com\/[A-Za-z0-9-]+/i],
  ["TikTok", /tiktok\.com\/@[A-Za-z0-9_.]+/i],
];

async function validImage(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { method: "HEAD", signal: AbortSignal.timeout(3000) });
    return res.ok && (res.headers.get("content-type") || "").startsWith("image");
  } catch {
    return false;
  }
}

function cleanSiteName(raw: string): string {
  // Trim common "Home — Brand · tagline" title decorations to the brand token.
  const first = raw.split(/[|–—·:]/)[0].trim();
  return (first.length >= 2 ? first : raw.trim()).slice(0, 80);
}

// Pull logo / brand color / social links / site name from the ACTUAL homepage.
// Logo is sourced from the site's own declared icons — never a third-party
// domain guess (which can return a different, similarly-named company's logo).
async function extractEnrichment(html: string, finalUrl: string): Promise<Enrichment> {
  const $ = cheerio.load(html);
  const origin = new URL(finalUrl).origin;
  const host = new URL(origin).hostname.replace(/^www\./, "");

  // Company name as the site declares it: og:site_name first, then <title>.
  const ogSite = $('meta[property="og:site_name"]').attr("content")?.trim();
  const title = $("title").first().text().trim();
  const siteName = ogSite || (title ? cleanSiteName(title) : undefined);

  // Brand color from theme-color meta (cheap, often present).
  let brandColor: string | undefined;
  const tc = $('meta[name="theme-color"]').attr("content")?.trim();
  if (tc && /^#?[0-9a-f]{3,8}$|^rgb/i.test(tc)) brandColor = tc.startsWith("#") || tc.startsWith("rgb") ? tc : `#${tc}`;

  // Social links (first match per network).
  const socials: Social[] = [];
  const seenTypes = new Set<string>();
  $("a[href]").each((_, el) => {
    const href = $(el).attr("href") || "";
    for (const [type, re] of SOCIAL_HOSTS) {
      if (seenTypes.has(type)) continue;
      if (re.test(href) && /^https?:/i.test(href)) {
        seenTypes.add(type);
        socials.push({ type, url: href.split("?")[0] });
      }
    }
  });

  // Logo, in priority order, from the site's OWN <head> (guaranteed same company):
  // apple-touch-icon → largest rel=icon → og:image → /favicon.ico → google favicon.
  const candidates: string[] = [];
  const pushIcon = (sel: string) => {
    $(sel).each((_, el) => {
      const href = $(el).attr("href") || $(el).attr("content");
      if (href) {
        try {
          candidates.push(new URL(href, origin).href);
        } catch {
          /* skip bad href */
        }
      }
    });
  };
  pushIcon('link[rel="apple-touch-icon"]');
  pushIcon('link[rel="apple-touch-icon-precomposed"]');
  pushIcon('link[rel~="icon"]');
  pushIcon('meta[property="og:image"]');
  candidates.push(`${origin}/favicon.ico`);

  let logo: string | undefined;
  for (const url of candidates) {
    if (await validImage(url)) {
      logo = url;
      break;
    }
  }
  // Guaranteed-valid last resort (same domain, never 404s → safe for the PDF).
  logo ??= `https://www.google.com/s2/favicons?domain=${host}&sz=128`;

  return { logo, brandColor, socials, siteName };
}

// Minimal robots.txt respect: collect Disallow paths under `User-agent: *`.
async function fetchDisallowed(origin: string): Promise<string[]> {
  try {
    const res = await fetch(`${origin}/robots.txt`, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return [];
    const txt = await res.text();
    const rules: string[] = [];
    let appliesToAll = false;
    for (const line of txt.split("\n")) {
      const l = line.trim();
      const ua = l.match(/^user-agent:\s*(.+)$/i);
      if (ua) {
        appliesToAll = ua[1].trim() === "*";
        continue;
      }
      const dis = l.match(/^disallow:\s*(.+)$/i);
      if (dis && appliesToAll) {
        const p = dis[1].trim();
        if (p && p !== "/") rules.push(p.toLowerCase());
      }
    }
    return rules;
  } catch {
    return [];
  }
}

function discoverLinks($: cheerio.CheerioAPI, origin: string, disallowed: string[] = []): string[] {
  const scored: { url: string; score: number }[] = [];
  const seen = new Set<string>();

  const originHost = new URL(origin).hostname.replace(/^www\./, "");
  $("a[href]").each((_, el) => {
    const href = $(el).attr("href");
    if (!href) return;
    let abs: URL;
    try {
      abs = new URL(href, origin);
    } catch {
      return;
    }
    // Same registrable host only — tolerate www/apex and http/https differences,
    // but never follow links to a different domain.
    if (abs.hostname.replace(/^www\./, "") !== originHost) return;
    const path = abs.pathname.toLowerCase();
    if (SKIP_FRAGMENTS.some((f) => path.includes(f) || href.includes(f))) return;
    if (disallowed.some((d) => path.startsWith(d))) return; // robots.txt

    // Normalize: drop query string + trailing slash BEFORE dedupe so
    // /pricing, /pricing/ and /pricing?ref=nav collapse to one page.
    const clean = abs.origin + abs.pathname.replace(/\/$/, "");
    if (seen.has(clean)) return;
    seen.add(clean);

    let score = 0;
    for (const [kw, w] of Object.entries(PAGE_KEYWORDS)) {
      if (path.includes(kw)) score = Math.max(score, w);
    }
    // shallow paths slightly favored
    const depth = path.split("/").filter(Boolean).length;
    if (score > 0) scored.push({ url: clean, score: score - depth * 0.5 });
  });

  return scored.sort((a, b) => b.score - a.score).map((s) => s.url);
}

// Crawl a site starting from homepage. onPage fires per fetched page for progress.
export async function crawlSite(
  startUrl: string,
  onPage?: (i: number, total: number, url: string) => void,
): Promise<CrawlResult> {
  const startOrigin = new URL(startUrl).origin;
  const contentHashes = new Set<string>();
  const globalSeen = new Set<string>(); // cross-page paragraph dedupe
  const pages: CrawledPage[] = [];
  let enrichment: Enrichment = { socials: [] };

  // Fetch robots.txt + homepage together.
  const [disallowed, home] = await Promise.all([fetchDisallowed(startOrigin), fetchPage(startUrl)]);
  let queue: string[] = [];
  // Scope everything to the FINAL post-redirect origin (fixes www/http drift).
  let origin = startOrigin;
  if (home) {
    origin = new URL(home.finalUrl).origin;
    // Enrichment from the pristine HTML before extract() strips header/footer.
    enrichment = await extractEnrichment(home.html, home.finalUrl);
    const $ = cheerio.load(home.html);
    const { title, text } = extract($, globalSeen);
    const homeKey = origin + (new URL(home.finalUrl).pathname.replace(/\/$/, "") || "");
    if (text) {
      pages.push({ url: home.finalUrl, title, text });
      contentHashes.add(text.slice(0, 200));
    }
    queue = discoverLinks($, origin, disallowed)
      .filter((u) => u !== homeKey)
      .slice(0, MAX_PAGES - 1);
  }

  const total = Math.min(MAX_PAGES, queue.length + 1);
  onPage?.(pages.length, total, startUrl);

  // 2. internal pages — fetch in parallel batches (bounded concurrency).
  for (let i = 0; i < queue.length && pages.length < MAX_PAGES; i += CONCURRENCY) {
    const batch = queue.slice(i, i + CONCURRENCY);
    const results = await Promise.allSettled(batch.map((u) => fetchPage(u)));
    for (let j = 0; j < results.length; j++) {
      if (pages.length >= MAX_PAGES) break;
      const r = results[j];
      if (r.status !== "fulfilled" || !r.value) continue;
      const $ = cheerio.load(r.value.html);
      const { title, text } = extract($, globalSeen);
      if (!text) continue;
      const hash = text.slice(0, 200);
      if (contentHashes.has(hash)) continue; // dedupe near-identical pages
      contentHashes.add(hash);
      pages.push({ url: batch[j], title, text });
      onPage?.(pages.length, total, batch[j]);
    }
  }

  // Low-yield detection (JS-heavy SPA that cheerio can't render): the caller
  // still has Serper snippets to lean on, but log it for visibility.
  const totalChars = pages.reduce((n, p) => n + p.text.length, 0);
  if (pages.length > 0 && totalChars < 300) {
    console.warn(`[crawl] low content yield for ${origin} (${totalChars} chars) — likely JS-rendered; relying on search snippets.`);
  }

  return { pages, sources: pages.map((p) => p.url), enrichment };
}
