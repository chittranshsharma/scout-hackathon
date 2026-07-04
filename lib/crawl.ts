import * as cheerio from "cheerio";

export type CrawledPage = { url: string; title: string; text: string };
export type CrawlResult = { pages: CrawledPage[]; sources: string[] };

const MAX_PAGES = 7;
const PER_PAGE_TIMEOUT = 12000;
const MAX_TEXT_PER_PAGE = 4000; // chars sent to AI per page
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

function fetchPage(url: string): Promise<string | null> {
  return fetch(url, {
    headers: { "User-Agent": UA, Accept: "text/html" },
    signal: AbortSignal.timeout(PER_PAGE_TIMEOUT),
    redirect: "follow",
  })
    .then((res) => {
      const ct = res.headers.get("content-type") || "";
      if (!res.ok || !ct.includes("text/html")) return null;
      return res.text();
    })
    .catch(() => null);
}

function extract($: cheerio.CheerioAPI): { title: string; text: string } {
  $("script, style, noscript, svg, nav, footer, header, form, iframe").remove();
  const title = $("title").first().text().trim() || $("h1").first().text().trim();
  const parts: string[] = [];
  $("h1, h2, h3, p, li").each((_, el) => {
    const t = $(el).text().replace(/\s+/g, " ").trim();
    if (t.length > 25) parts.push(t);
  });
  let text = parts.join("\n");
  if (text.length > MAX_TEXT_PER_PAGE) text = text.slice(0, MAX_TEXT_PER_PAGE);
  return { title, text };
}

function discoverLinks($: cheerio.CheerioAPI, origin: string): string[] {
  const scored: { url: string; score: number }[] = [];
  const seen = new Set<string>();

  $("a[href]").each((_, el) => {
    const href = $(el).attr("href");
    if (!href) return;
    let abs: URL;
    try {
      abs = new URL(href, origin);
    } catch {
      return;
    }
    if (abs.origin !== origin) return; // same-domain only
    const path = abs.pathname.toLowerCase();
    if (SKIP_FRAGMENTS.some((f) => path.includes(f) || href.includes(f))) return;

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
  const origin = new URL(startUrl).origin;
  const visited = new Set<string>();
  const contentHashes = new Set<string>();
  const pages: CrawledPage[] = [];

  // 1. homepage
  const homeHtml = await fetchPage(startUrl);
  const queue: string[] = [];
  if (homeHtml) {
    const $ = cheerio.load(homeHtml);
    const { title, text } = extract($);
    const home = origin + (new URL(startUrl).pathname.replace(/\/$/, "") || "");
    visited.add(home);
    if (text) {
      pages.push({ url: startUrl, title, text });
      contentHashes.add(text.slice(0, 200));
    }
    queue.push(...discoverLinks($, origin));
  }

  const total = Math.min(MAX_PAGES, queue.length + 1);
  onPage?.(pages.length, total, startUrl);

  // 2. internal pages
  for (const url of queue) {
    if (pages.length >= MAX_PAGES) break;
    if (visited.has(url)) continue;
    visited.add(url);

    const html = await fetchPage(url);
    if (!html) continue;
    const $ = cheerio.load(html);
    const { title, text } = extract($);
    if (!text) continue;

    const hash = text.slice(0, 200);
    if (contentHashes.has(hash)) continue; // dedupe near-identical pages
    contentHashes.add(hash);

    pages.push({ url, title, text });
    onPage?.(pages.length, total, url);
  }

  return { pages, sources: pages.map((p) => p.url) };
}
