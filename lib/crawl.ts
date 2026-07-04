import * as cheerio from "cheerio";
import type { Social } from "./types";

export type CrawledPage = { url: string; title: string; text: string };
export type Enrichment = {
  logo?: string;
  brandColor?: string;
  techStack: string[];
  socials: Social[];
};
export type CrawlResult = { pages: CrawledPage[]; sources: string[]; enrichment: Enrichment };

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
  $("script, style, noscript, svg, nav, footer, header, form, iframe, template").remove();
  // Strip cookie/consent/ad banners so their boilerplate doesn't pollute AI input.
  $(
    '[id*="cookie" i], [class*="cookie" i], [id*="consent" i], [class*="consent" i], [class*="banner" i], [id*="gdpr" i], [class*="gdpr" i], [aria-label*="cookie" i], [role="dialog"]',
  ).remove();
  const title = $("title").first().text().trim() || $("h1").first().text().trim();
  const parts: string[] = [];
  const seen = new Set<string>();
  $("h1, h2, h3, p, li").each((_, el) => {
    const t = $(el).text().replace(/\s+/g, " ").trim();
    // Keep meaningful prose; drop shorties and repeated menu/CTA text.
    if (t.length > 25 && !seen.has(t)) {
      seen.add(t);
      parts.push(t);
    }
  });
  let text = parts.join("\n");
  if (text.length > MAX_TEXT_PER_PAGE) text = text.slice(0, MAX_TEXT_PER_PAGE);
  return { title, text };
}

// Signatures for lightweight tech-stack fingerprinting from raw homepage HTML.
const TECH_SIGNS: [string, RegExp][] = [
  ["Next.js", /\/_next\/|__NEXT_DATA__/],
  ["React", /data-reactroot|react\.production|_reactListening/],
  ["Vue.js", /data-v-[0-9a-f]{8}|__vue__|vue\.runtime/],
  ["Angular", /ng-version=|ng-app=/],
  ["Gatsby", /___gatsby|gatsby-/],
  ["Svelte", /svelte-[0-9a-z]+/],
  ["WordPress", /wp-content|wp-includes/],
  ["Shopify", /cdn\.shopify\.com|Shopify\.theme/],
  ["Wix", /static\.wixstatic\.com|_wixCssImports/],
  ["Squarespace", /squarespace\.com|static1\.squarespace/],
  ["Webflow", /assets\.website-files\.com|webflow\.js/],
  ["HubSpot", /js\.hs-scripts\.com|hs-analytics/],
  ["Google Analytics", /googletagmanager\.com|google-analytics\.com|gtag\(/],
  ["Segment", /cdn\.segment\.com|analytics\.js/],
  ["Intercom", /widget\.intercom\.io|intercomSettings/],
  ["Stripe", /js\.stripe\.com/],
  ["Cloudflare", /cdnjs\.cloudflare\.com|__cf_/],
];

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
    const res = await fetch(url, { method: "HEAD", signal: AbortSignal.timeout(5000) });
    return res.ok && (res.headers.get("content-type") || "").startsWith("image");
  } catch {
    return false;
  }
}

// Pull logo / brand color / tech stack / socials from the pristine homepage.
async function extractEnrichment(html: string, origin: string): Promise<Enrichment> {
  const $ = cheerio.load(html);
  const host = new URL(origin).hostname.replace(/^www\./, "");

  // Brand color from theme-color meta (cheap, often present).
  let brandColor: string | undefined;
  const tc = $('meta[name="theme-color"]').attr("content")?.trim();
  if (tc && /^#?[0-9a-f]{3,8}$|^rgb/i.test(tc)) brandColor = tc.startsWith("#") || tc.startsWith("rgb") ? tc : `#${tc}`;

  // Tech stack fingerprint.
  const techStack: string[] = [];
  for (const [name, re] of TECH_SIGNS) {
    if (re.test(html)) techStack.push(name);
  }

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

  // Logo: Clearbit gives clean transparent PNGs; fall back to a favicon that
  // always resolves. Validated so the PDF renderer never hits a 404.
  const clearbit = `https://logo.clearbit.com/${host}`;
  const favicon = `https://www.google.com/s2/favicons?domain=${host}&sz=128`;
  const logo = (await validImage(clearbit)) ? clearbit : favicon;

  return { logo, brandColor, techStack: techStack.slice(0, 8), socials };
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
  const origin = new URL(startUrl).origin;
  const visited = new Set<string>();
  const contentHashes = new Set<string>();
  const pages: CrawledPage[] = [];
  let enrichment: Enrichment = { techStack: [], socials: [] };

  // Fetch robots.txt + homepage together.
  const [disallowed, homeHtml] = await Promise.all([fetchDisallowed(origin), fetchPage(startUrl)]);
  const queue: string[] = [];
  if (homeHtml) {
    // Enrichment from the pristine HTML before extract() strips header/footer.
    enrichment = await extractEnrichment(homeHtml, origin);
    const $ = cheerio.load(homeHtml);
    const { title, text } = extract($);
    const home = origin + (new URL(startUrl).pathname.replace(/\/$/, "") || "");
    visited.add(home);
    if (text) {
      pages.push({ url: startUrl, title, text });
      contentHashes.add(text.slice(0, 200));
    }
    queue.push(...discoverLinks($, origin, disallowed));
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

  // Low-yield detection (JS-heavy SPA that cheerio can't render): the caller
  // still has Serper snippets to lean on, but log it for visibility.
  const totalChars = pages.reduce((n, p) => n + p.text.length, 0);
  if (pages.length > 0 && totalChars < 300) {
    console.warn(`[crawl] low content yield for ${origin} (${totalChars} chars) — likely JS-rendered; relying on search snippets.`);
  }

  return { pages, sources: pages.map((p) => p.url), enrichment };
}
