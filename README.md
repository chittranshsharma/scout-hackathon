# Scout — AI Company Research Assistant

Enter a **company name** or **website URL**. Scout resolves the official site, crawls its key pages, enriches with web search, reasons over everything with an LLM, identifies competitors, and produces an **intelligence dossier** plus a **downloadable PDF report** — all in a ChatGPT-style interface with a live research pipeline.

Built for the Relu Consultancy AI & Automation hackathon.

![Next.js](https://img.shields.io/badge/Next.js-16-000) ![OpenRouter](https://img.shields.io/badge/AI-OpenRouter-35e0c1) ![Serper](https://img.shields.io/badge/Search-Serper.dev-f5a623)

---

## Features

| Requirement | Implementation |
|---|---|
| **Company research** | Name **or** URL input; name → official site via Serper; extracts name, website, phone, address, products, AI pain points |
| **Website crawling** | `cheerio` crawler discovers About/Products/Services/Solutions/Contact/Pricing; keyword-scored link selection; dedupes by URL + content hash; skips login/legal/blog/asset pages; strips nav/footer/scripts |
| **Search** | Serper.dev for official-site resolution, contact enrichment, competitor discovery, public snippets |
| **AI** | OpenRouter with **user-selectable model** (free models default); strict JSON output; one repair-retry on malformed JSON |
| **Competitor analysis** | AI proposes 3–6 rivals (same industry/market) with names + websites, seeded by search |
| **Interactive UI** | ChatGPT-style chat, live **research pipeline** with per-stage progress streamed over **SSE** |
| **PDF** | Server-side `@react-pdf/renderer` — branded, one-click download |
| **Discord (bonus)** | Settings for bot token / channel ID / applicant name+email; auto-sends report + PDF after generation |

### Standout features (bonus)
- **Conversational follow-up chat** — after the report, keep asking: *"how do they make money?"*, *"compare them to Competitor X"*. Answers stream token-by-token, grounded in the crawled + searched context (`/api/chat`). A true ChatGPT-style assistant, not a one-shot form.
- **Deterministic enrichment** — extracts the company **logo** (validated Clearbit → favicon fallback), **brand color** (theme-color → tints the report + PDF), **tech-stack fingerprint** (Next.js/React/Shopify/HubSpot/GA/Stripe/…), and **social profiles** straight from the homepage. Shown in the dossier and the PDF.
- **Polish** — typewriter reveal on the AI summary, numbered source citations, copy-as-Markdown, one-click regenerate.

### Engineering touches
- **Server-Sent Events** stream live progress (resolve → crawl *N/M* → search → analyze) and chat tokens.
- **Graceful degradation**: Serper down → crawl-only; crawl blocked → search snippets; both fail → name-only with a low-confidence note; model rejects JSON mode → retry without it; Discord failure never breaks the report.
- **No secrets in the client**: keys live in in-memory React context, sent per-request, used server-side only, never logged, never persisted. `.env` fallback for baked-in deploy keys.
- **No database, no auth** (per spec) — nothing is stored.

---

## Tech stack

- **Next.js 16** (App Router) + **TypeScript** + **Tailwind CSS v4** — single unified project
- **cheerio** — crawling / HTML extraction
- **@react-pdf/renderer** — PDF generation
- **OpenRouter** (AI) · **Serper.dev** (search) · **Discord Bot API** (bonus)

---

## Setup

```bash
git clone <repo> && cd scout
npm install
cp .env.example .env.local   # optional — you can also paste keys in the UI
npm run dev                  # http://localhost:3000
```

Open the app → **Settings** → paste your keys, or set them in `.env.local`.

### API keys
| Key | Where | Required |
|---|---|---|
| `OPENROUTER_API_KEY` | https://openrouter.ai/keys (free) | Yes — AI analysis |
| `SERPER_API_KEY` | https://serper.dev (free 2,500 queries) | Recommended — search/resolve |
| `DISCORD_BOT_TOKEN` | Discord Developer Portal → Bot | Only for Discord bonus |
| `DISCORD_CHANNEL_ID` | Right-click channel → Copy ID (Developer Mode on) | Only for Discord bonus |

All keys are optional as env vars — the in-app **Settings** panel accepts them at runtime.

---

## Environment variables

See [`.env.example`](.env.example). Every variable is optional at the env level because the UI can supply the same values; the server reads a request-body key first, then falls back to the matching env var.

```
OPENROUTER_API_KEY   # AI (mandatory to run analysis)
SERPER_API_KEY       # search enrichment (recommended)
DISCORD_BOT_TOKEN    # Discord bonus
DISCORD_CHANNEL_ID   # Discord bonus
```

---

## Architecture

```
app/
  page.tsx                  ChatGPT-style client UI (chat, pipeline, dossier)
  api/research/route.ts     SSE orchestrator: resolve → crawl → search → analyze
  api/pdf/route.ts          report JSON → PDF download
  api/discord/route.ts      report + PDF → Discord channel
lib/
  resolve.ts   name→official URL / URL normalization
  crawl.ts     page discovery, dedupe, content extraction
  serper.ts    search helpers (site, contact, competitors, public info)
  ai.ts        OpenRouter structured-JSON call + repair retry
  pdf.tsx      branded PDF document
  discord.ts   multipart upload to Discord
  store.tsx    in-memory settings context
components/     Sidebar, Settings, Pipeline, ReportCard, icons
```

**Flow:** input → `/api/research` (SSE) streams progress while it resolves the site (Serper), crawls key pages (cheerio), enriches (Serper), and analyzes (OpenRouter) → `Report` renders as a dossier card → **Download PDF** / auto-**Send to Discord**.

---

## Deploy (Vercel)

```bash
npm i -g vercel
vercel            # follow prompts
vercel --prod
```

Add the environment variables in the Vercel dashboard (Project → Settings → Environment Variables) or leave them blank and let evaluators paste keys in the Settings panel. `@react-pdf/renderer` is declared in `serverExternalPackages` so it runs correctly on serverless.

---

## Notes

- Model selection accepts any OpenRouter model id (dropdown or custom).
- Keys entered in the UI are session-only and cleared on reload — for a persistent demo, set them as Vercel env vars.
