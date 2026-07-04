# AI Company Research Assistant — Design Spec

**Date:** 2026-07-04
**Context:** Relu Consultancy FTE hiring hackathon (6h). Build an AI-powered company research assistant. Score target: 100 (80 core + 20 bonus).

## Goal

User submits a **company name** or **website URL**. App resolves the official site, crawls it, enriches via search, runs AI analysis, identifies competitors, renders a report in a ChatGPT-style UI, and produces a downloadable professional PDF. Optional: auto-send report + PDF to Discord.

## Stack

- **Next.js 15 (App Router) + TypeScript + Tailwind CSS**, single unified project.
- **Deploy:** Vercel.
- **AI:** OpenRouter (mandatory). Default free model `meta-llama/llama-3.3-70b-instruct:free`; dropdown offers `meta-llama/llama-3.1-8b-instruct:free`, `deepseek/deepseek-chat-v3-0324:free`, `google/gemini-2.0-flash-exp:free`, plus free-text entry for any model id.
- **Search:** Serper.dev (mandatory).
- **Crawl:** native `fetch` + `cheerio` (no headless browser — fast, serverless-friendly).
- **PDF:** `@react-pdf/renderer`, server-side.
- **Discord:** Bot API `POST /channels/{id}/messages` multipart file upload.
- **No database, no auth** (per spec).

## Architecture

```
app/
  page.tsx                    ChatGPT-style client UI (chat, sidebar, settings)
  api/research/route.ts       SSE orchestrator — streams progress + final report
  api/pdf/route.ts            report JSON -> PDF download
  api/discord/route.ts        report + PDF -> Discord channel
lib/
  resolve.ts   company name -> official URL (Serper), or normalize given URL
  crawl.ts     discover key pages, dedupe, strip nav/login, extract clean text
  serper.ts    search helpers: website, contact, competitors, public info
  ai.ts        OpenRouter call -> structured JSON report
  discord.ts   multipart upload to Discord
  types.ts     shared Report / Settings types
components/     Chat, MessageCard, ReportCard, Sidebar, SettingsPanel, ModelPicker
```

### Config model (no localStorage)

Settings (OpenRouter key, model, Serper key, Discord bot token, channel id, applicant name, applicant email) live in **in-memory React context** for the session. Sent in the POST body of each API call; used **server-side only**, never logged, never persisted. **`.env` fallback**: if a key is absent from the request body, server routes read `process.env` (OPENROUTER_API_KEY, SERPER_API_KEY, DISCORD_BOT_TOKEN, DISCORD_CHANNEL_ID). Reload clears in-memory settings — evaluator re-enters or bakes them into env. Documented in README.

### Data flow

1. User enters name/URL, hits Research.
2. `POST /api/research` opens an **SSE stream**. Stages emit `progress` events:
   `resolving -> crawling (page N/M) -> searching -> analyzing -> done`.
3. `resolve.ts`: if input is a URL, normalize. If a name, Serper search -> pick official domain (filter out social/aggregator hosts).
4. `crawl.ts`: fetch homepage, extract same-domain links, score by keyword (about, product, service, solution, contact, pricing), pick top ~6-8, fetch, dedupe by URL + content hash, skip login/auth pages, strip nav/footer/script, extract readable text (cap length per page).
5. `serper.ts`: enrich — contact details, competitor candidates, public snippets.
6. `ai.ts`: send crawled text + search snippets to OpenRouter with a strict JSON-schema prompt. Returns `Report`. Malformed JSON -> one repair retry.
7. Final `report` event streams the `Report`; UI renders a report card with a **Download PDF** button.
8. If Discord settings present, auto-fire `POST /api/discord` after report (client-triggered) — generates PDF server-side, sends applicant + company + PDF to channel. Non-blocking; failures shown as a toast, never break the report.

### Report shape

```ts
type Competitor = { name: string; website: string };
type Report = {
  company: {
    name: string;
    website: string;
    phone?: string;
    address?: string;
    products: string[];      // products / services
    painPoints: string[];    // AI-generated
    summary: string;         // AI company summary
  };
  competitors: Competitor[]; // same country/industry/products
  sources: string[];         // URLs used (crawl + search) for references bonus
  model: string;             // which OpenRouter model produced it
};
```

## UI / UX (own design — polished, not a clone)

Modern ChatGPT-style, dark theme, own visual identity. Bonus points for polish.

- **Sidebar:** brand mark, **New Research**, tab toggle **Config** / **Discord**, "How it works" numbered steps.
- **Config tab:** OpenRouter key (password field), model picker (dropdown + custom), Serper key, Save (updates in-memory context).
- **Discord tab:** bot token, channel id, applicant name, applicant email, Save. Small "auto-send after report" indicator.
- **Main:** centered hero with tagline + example chips (Stripe, Tesla, Microsoft, a URL) on empty state; input pinned bottom; on submit, chat scrolls with a live **progress stepper** (animated), then a **report card**: company header, contact block, products chips, pain-point list, competitor table (name -> clickable website), sources, **Download PDF** + **Send to Discord** buttons.
- **Responsive:** sidebar collapses to a drawer on mobile; report card reflows; input full-width.
- **Motion:** subtle fade/slide on messages, animated stepper, skeleton while streaming.
- **Design execution** via frontend-design skill: strong type scale, spacing rhythm, accessible contrast, hover/focus states.

## Error handling (graceful degradation)

- Missing OpenRouter key -> clear UI error, no request.
- **Serper fails/absent -> skip search step, proceed crawl-only, no hard-fail.**
- Crawl fails (blocked/timeout) -> fall back to Serper snippets only.
- Both fail -> AI works from name alone, flags low confidence.
- Malformed AI JSON -> one repair retry, then surface partial.
- Discord failure -> toast only; report unaffected.
- All fetches timeout-guarded; per-page and total crawl caps.

## Non-goals (YAGNI)

No RAG, no auth, no DB, no report history, no headless browser, no multi-company compare.

## Deliverables

Source, Vercel URL, README (setup + env var docs), all functional pieces, Discord bonus.
