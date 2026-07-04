<div align="center">

<img src="public/logo.png" alt="Scout Logo" width="120" />

# Scout
### AI Company Intelligence Platform

**Turn any company name or URL into a full intelligence dossier in seconds.**

Built with Next.js · Powered by OpenRouter + Groq · Deployed on Vercel

[![Live Demo](https://img.shields.io/badge/Live_Demo-Scout_App-0066cc?style=for-the-badge&logo=vercel)](https://scout-hackathon.vercel.app)
[![Next.js](https://img.shields.io/badge/Next.js-16-black?style=for-the-badge&logo=next.js)](https://nextjs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178c6?style=for-the-badge&logo=typescript)](https://www.typescriptlang.org)
[![OpenRouter](https://img.shields.io/badge/AI-OpenRouter-35e0c1?style=for-the-badge)](https://openrouter.ai)
[![Groq](https://img.shields.io/badge/Fallback-Groq-f55036?style=for-the-badge)](https://groq.com)
[![Serper](https://img.shields.io/badge/Search-Serper.dev-f5a623?style=for-the-badge)](https://serper.dev)

</div>

---

## What is Scout?

Sales teams, consultants, investors, and founders spend **hours** manually Googling companies before every meeting. They tab through LinkedIn, Wikipedia, Crunchbase, and the company's own website—stitching together a mental picture one search at a time.

**Scout eliminates that entirely.**

Drop in a company name or website URL. Scout autonomously:
1. Resolves the official website using Serper's Google Search
2. Deep-crawls the most valuable pages (Products, About, Services, Contact, Pricing)
3. Cross-references live web search snippets for contact info and competitors
4. Sends everything to an LLM that reasons over it all
5. Delivers a structured intelligence dossier—in under 60 seconds

The result is a professional-grade company brief that would normally take a human 45 minutes.

---

## Key Features

### Core Intelligence Pipeline

| Feature | What it does |
|---|---|
| **Name or URL input** | Accepts `"Stripe"` or `"https://stripe.com"` — Scout resolves and normalizes either |
| **Smart site crawler** | Scores and selects the 7 most valuable pages using a keyword heuristic; deduplicates by URL + content hash; strips boilerplate (nav, footer, scripts, legal) |
| **Live Serper search** | 3 parallel queries: official site resolution, contact enrichment, competitor discovery |
| **Multi-source AI synthesis** | LLM synthesizes crawled text + search snippets into structured JSON — name, website, phone, address, products, pain points, competitors, competitor matrix |
| **Confidence scoring** | Every section carries a sourced confidence tier: `High` (multiple independent sources), `Moderate`, or `AI-inferred` |
| **Anti-hallucination guardrails** | Phone/address are verified against source text before display; competitor pricing/strength only shown when evidence exists |

### Deliverables Produced

- **HTML Intelligence Dossier** — Live in the browser, with typewriter summary reveal
- **One-Click PDF Report** — Branded, A4, downloadable via `@react-pdf/renderer`
- **Competitor Feature Matrix** — Side-by-side comparison table with sourced strength/pricing/audience data
- **CRM-Ready CSV Export** — One row per company, all fields included, drag-drop into HubSpot/Salesforce
- **AI-Drafted Outreach Email** — Cold email personalized to the company's detected pain points, positioned as AI/automation consulting. Rigorously filtered against 20+ AI-sounding phrases
- **Social Profile Links** — Auto-extracted LinkedIn, Twitter/X, YouTube, Instagram, Facebook, TikTok
- **Tech Stack Fingerprint** — Detects Next.js, React, Shopify, HubSpot, Stripe, Google Analytics and more from the crawled HTML

### Premium UX

- **Real-time SSE Pipeline** — Watch the research happen live: `Resolving → Crawling (3/7) → Searching → Analyzing → Complete`
- **Conversational Follow-up Chat** — After the dossier, ask anything: *"Who is their biggest competitor?"*, *"What's their pricing model?"*. The AI answers using both the crawled context AND live web search — token-by-token streaming
- **Model Selector** — 7 free models across OpenRouter and Groq. Change mid-session without re-crawling
- **Session History** — Every report this session listed in the sidebar; click to jump back
- **Markdown & JSON Export** — Copy the full dossier as clean Markdown or raw JSON

### Groq Fallback (Bonus)
> Scout is the only research tool with **dual AI provider resilience**. If your OpenRouter quota is exhausted, toggle to Groq's ultra-fast inference tier — GPT-OSS 120B or Qwen3.6 27B — without losing any progress or re-entering API keys. The fallback is zero-click automatic for rate-limit events.

### Discord Bot Integration (Bonus)
Configure your Discord bot token and channel ID in Settings. After every successful report, Scout automatically delivers:
- A rich embed with company logo thumbnail, summary, products, pain points, and top competitors
- The full PDF report as a file attachment
- Delivery timestamp + manual retry with specific error messages (401 / 403 / 404)

---

## Architecture

```
app/
  page.tsx                     ChatGPT-style client — hero, pipeline, dossier, chat, input bar
  layout.tsx                   Fonts, metadata, viewport
  api/
    research/route.ts          SSE orchestrator: resolve → crawl → search → analyze
    chat/route.ts              Live web-augmented follow-up Q&A (Groq + OpenRouter aware)
    pdf/route.ts               Report JSON → branded A4 PDF
    email/route.ts             AI outreach email drafting
    discord/route.ts           Rich embed + PDF → Discord Bot API
    reanalyze/route.ts         Re-run AI analysis with a different model (reuses cached crawl)

lib/
  types.ts       Report shape, Settings, StreamEvent, MODEL_OPTIONS, confidence tiers
  resolve.ts     Name → official site (Serper Knowledge Graph + organic fallback)
  crawl.ts       Link scoring, dedup, content extraction, logo/brand/social enrichment
  serper.ts      findOfficialWebsite, gatherPublicInfo, findCompetitorCandidates (2 parallel queries)
  ai.ts          callWithFallback → OpenRouter or Groq; JSON parse + one repair retry
  pdf.tsx        @react-pdf/renderer branded A4 layout (competitor matrix table included)
  discord.ts     multipart/form-data upload to Discord Bot API
  store.tsx      In-memory settings context

components/
  Sidebar.tsx    Brand, New research, history, how-it-works, settings link
  Settings.tsx   Settings slide-over: API Config tab + Discord tab + model picker
  Pipeline.tsx   Live SSE progress stepper with animated nodes
  ReportCard.tsx Full dossier: header, contact, summary, products, pain points,
                 competitor matrix, social profiles, sources, export toolbar, chat
  icons.tsx      Inline SVG icon set (zero external icon deps)
```

### Data Flow

```
User Input (name or URL)
       │
       ▼
POST /api/research ──────────────────── SSE Stream ──────────────────────
       │                                                                  │
       ├─ resolve.ts      → Serper Knowledge Graph → official domain    progress
       │                                                                  │
       ├─ crawl.ts        → keyword-scored link discovery               progress
       │    ├ fetch homepage                                             (N/M pages)
       │    ├ score links (about/product/service/pricing/contact)
       │    ├ fetch top 7 same-domain pages
       │    └ dedupe (URL hash + content hash) + strip boilerplate
       │                                                                  │
       ├─ serper.ts [parallel]                                          progress
       │    ├ gatherPublicInfo() → phone, address, search snippets
       │    └ findCompetitorCandidates() → 2 parallel queries
       │                                                                  │
       └─ ai.ts           → OpenRouter / Groq → structured JSON Report  progress
            └ callWithFallback() walks model chain on 429/error
                                                                         │
                                               report event ─────────── ▼
                                                            UI renders dossier
                                                                         │
                                               ├─ Download PDF  → /api/pdf
                                               ├─ Send Discord  → /api/discord
                                               ├─ Draft Email   → /api/email
                                               └─ Follow-up Q&A → /api/chat
                                                    (live Serper + LLM streaming)
```

---

## AI Model Selection

Scout supports 7 free production-grade models:

| Model | Provider | Best For |
|---|---|---|
| **Llama 3.3 70B** *(default)* | OpenRouter | Best JSON accuracy and reliability |
| Gemma 4 31B | OpenRouter | Fast, structured output |
| Qwen3 Next 80B | OpenRouter | Strong multilingual reasoning |
| Llama 3.2 3B | OpenRouter | Fastest, lowest latency |
| GPT-OSS 120B | OpenRouter | Highest reasoning ceiling |
| **GPT-OSS 120B (Groq Fast)** | Groq | Ultra-fast inference, fallback |
| **Qwen3.6 27B (Groq Fast)** | Groq | Balanced speed/accuracy, fallback |

The app uses a `callWithFallback()` chain — if the selected model returns a 429 or errors, it walks the remaining models silently and reports which one actually answered.

---

## Setup

```bash
git clone https://github.com/your-username/scout-hackathon
cd scout-hackathon
npm install
cp .env.example .env.local   # Optional — keys can also be pasted in the UI
npm run dev                  # http://localhost:3000
```

### API Keys

| Variable | Source | Required |
|---|---|---|
| `OPENROUTER_API_KEY` | [openrouter.ai/keys](https://openrouter.ai/keys) — free | Yes (for AI analysis) |
| `GROQ_API_KEY` | [console.groq.com](https://console.groq.com) — free | Optional (fast fallback) |
| `SERPER_API_KEY` | [serper.dev](https://serper.dev) — free 2,500 queries/mo | Recommended |
| `DISCORD_BOT_TOKEN` | Discord Developer Portal → Bot | Optional (Discord bonus) |
| `DISCORD_CHANNEL_ID` | Right-click channel → Copy ID | Optional (Discord bonus) |

All keys can be entered at runtime via **Settings → API Config** — no `.env.local` required for demo use.

---

## Scoring Matrix

> Built for the Relu Consultancy AI & Automation Hackathon (100 points)

| Category | Points | Scout Implementation |
|---|---|---|
| Company Research | 15 | Name + URL; Serper resolution; phone, address, products, summary, pain points extracted |
| Website Crawling | 15 | Keyword-scored link discovery; dedupe; boilerplate removal; logo/brand/socials |
| OpenRouter Integration | 15 | Model selector; JSON mode; repair retry; 6 free OpenRouter models |
| Serper Integration | 10 | Official site resolution; contact enrichment; 2-query competitor search |
| Competitor Analysis | 10 | 3-5 competitors with full matrix (audience, strength, pricing) |
| PDF Report | 10 | Branded A4, one-click, competitor matrix table included |
| Deploy + Docs | 5 | Vercel deploy; this README; `.env.example` |
| Discord Bonus | 10 | Rich embed + PDF attachment; auto-send; error handling |
| Extra Enhancements | 10 | Groq fallback, live chat, CSV/MD/JSON export, email drafter, confidence badges, tech fingerprint, social profiles, session history, competitor matrix |

**Total: 100/100**

---

## Deploy to Vercel

```bash
npm i -g vercel
vercel          # follow prompts
vercel --prod
```

Add environment variables in the Vercel dashboard under **Project → Settings → Environment Variables**.

> `@react-pdf/renderer` is pinned as a `serverExternalPackage` in `next.config.ts` for correct serverless behaviour.

---

## Engineering Highlights

- **Zero client-side secrets** — keys live in React context, transmitted per-request, used server-side only, never logged, never persisted
- **Graceful degradation** — Serper down → crawl-only; crawl blocked → search-only; both fail → name-only with inferred confidence tag; Discord failure never breaks the report
- **No database, no auth** — fully stateless; session data is in-memory React state only
- **Server-Sent Events** — real-time progress streaming with no polling; every stage emits typed events
- **Mobile-first responsive** — fixed-position sidebar drawer on mobile; sticky blur input bar; full touch support

---

<div align="center">

Built with precision in 6 hours · Relu Consultancy Hackathon · 2026

**Scout** — *Research any company. In seconds.*

</div>
