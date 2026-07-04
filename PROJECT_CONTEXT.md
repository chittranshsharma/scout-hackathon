# Scout — Project Context & Build Status

**Project:** AI Company Research Assistant ("Scout")
**For:** Relu Consultancy — FTE Hiring Challenge (AI & Automation Developer), 6-hour hackathon
**Date started:** 2026-07-04
**Stack:** Next.js 16 (App Router) · TypeScript · Tailwind CSS v4 · deploy target Vercel
**Status:** Core app fully built, typechecks + production build pass, UI verified in browser. **Not yet run end-to-end against live API keys. Not yet deployed.**

---

## 1. What the assignment asks for

Build an AI-powered assistant that researches any company from a **name or website URL**:
crawl the site, collect public info, run AI analysis, find competitors, and generate a downloadable **PDF report** in a **ChatGPT-style UI**.

**Mandated tech:** OpenRouter (AI) · Serper.dev (search). Any crawler. Deploy publicly. No DB, no auth.

**Scoring (100):** Company Research 15 · Crawling 15 · OpenRouter 15 · Serper 10 · Competitors 10 · PDF 10 · Deploy+Docs 5 · Discord bonus 10 · Extra-enhancements bonus 10.

---

## 2. Key decisions made (with the user)

| Decision | Choice | Why |
|---|---|---|
| Stack / deploy | Next.js on Vercel, single unified project | Matches "single unified project" + environment |
| AI provider | **OpenRouter** (mandatory). User's Grok reached *through* OpenRouter as `x-ai/grok-4-fast:free` | Direct Grok/x.ai key would fail the "OpenRouter must be used" acceptance criterion + lose 15 pts |
| Default model | `meta-llama/llama-3.3-70b-instruct:free` (free tier) | Strong + $0; dropdown allows any model |
| Search | Serper.dev (user has a 2,500-query key) | Mandated |
| Discord bonus | **Build it** | +10 pts |
| Key storage | **In-memory React context** only (no localStorage) + `.env` fallback | User constraint; keys sent per-request, used server-side only |
| Crawler | `cheerio` + native fetch (no headless browser) | Fast, serverless-friendly |
| PDF | `@react-pdf/renderer` server-side | Clean branded layout |
| Progress | **Server-Sent Events** live pipeline | Progress-tracking bonus |
| UI direction | Custom "Intelligence Terminal" theme — deep slate, cyan-mint signal accent, amber only for PDF; **not** a clone of the sample site | User asked for best-in-class original design |

**Design identity:** display font **Sora**, body **Inter**, data/labels **JetBrains Mono**. Signature element = live **research pipeline** with a glowing scan-node that fills per stage.

---

## 3. Architecture

```
app/
  layout.tsx                fonts + metadata
  globals.css               design tokens (Tailwind v4 @theme) + animations
  page.tsx                  ChatGPT-style client UI (chat, pipeline, dossier, input, hero)
  api/research/route.ts     SSE orchestrator: resolve → crawl → search → analyze
  api/pdf/route.ts          report JSON → PDF download
  api/discord/route.ts      report + PDF → Discord channel
lib/
  types.ts     shared Report / Settings / StreamEvent types, model list, DEFAULT_MODEL
  resolve.ts   name → official URL (Serper) / URL normalization
  crawl.ts     page discovery, keyword scoring, dedupe (URL + content hash), extraction
  serper.ts    search helpers: findOfficialWebsite, gatherPublicInfo, findCompetitorCandidates
  ai.ts        OpenRouter structured-JSON call + one repair retry
  pdf.tsx      branded A4 PDF document (renderReportPdf → Buffer)
  discord.ts   multipart upload (embed + PDF) to Discord Bot API
  store.tsx    in-memory settings context (SettingsProvider / useSettings)
components/
  icons.tsx     inline SVG icon set (no external deps)
  Sidebar.tsx   brand, New research, how-it-works, status dots, settings button
  Settings.tsx  slide-over with API Config + Discord tabs
  Pipeline.tsx  signature live progress stepper
  ReportCard.tsx  intelligence dossier: header, contact, summary, products, pain points, competitor table, sources, actions
docs/superpowers/specs/2026-07-04-company-research-assistant-design.md   full design spec
.env.example    documented env vars
README.md       setup, env docs, architecture, deploy
```

### Data flow
1. User submits name/URL → `POST /api/research` opens an **SSE stream**.
2. Stages emit `progress` events: `resolving → crawling (N/M) → searching → analyzing → done`.
3. `resolve.ts`: URL → normalized; name → Serper picks official domain (filters wikipedia/linkedin/crunchbase/etc).
4. `crawl.ts`: fetch homepage, score same-domain links by keyword (about/product/service/solution/contact/pricing), fetch top ~7, dedupe by URL + first-200-char content hash, skip login/legal/blog/asset pages, strip nav/footer/script, cap text per page (4k chars).
5. `serper.ts`: enrich contact + competitor candidates + public snippets.
6. `ai.ts`: send crawl text + snippets to OpenRouter with strict JSON schema → `Report`; malformed JSON → one repair retry.
7. `report` event streams the `Report`; UI renders dossier card with **Download PDF** + **Send to Discord**.
8. If Discord configured, auto-fires `POST /api/discord` after report (non-blocking; failure = toast only).

### Report shape
```ts
type Report = {
  company: { name; website; phone?; address?; products[]; painPoints[]; summary };
  competitors: { name; website }[];
  sources: string[];
  model: string;
};
```

---

## 4. Requirement → implementation map

| Requirement | Where | Status |
|---|---|---|
| Name **and** URL input | `lib/resolve.ts`, hero + input | ✅ |
| Determine official website | `serper.findOfficialWebsite` | ✅ |
| Crawl About/Products/Services/Solutions/Contact/Pricing | `lib/crawl.ts` keyword scoring | ✅ |
| Ignore duplicate/login/irrelevant pages | `SKIP_FRAGMENTS` + content-hash dedupe | ✅ |
| Serper for search/research | `lib/serper.ts` | ✅ |
| OpenRouter + model selection | `lib/ai.ts`, Settings model picker | ✅ |
| Company summary + pain points | AI prompt → `Report` | ✅ |
| Competitors (name + website) | AI + search seed → competitor table | ✅ |
| ChatGPT-style interface | `app/page.tsx` | ✅ |
| Progress indicators | SSE + `Pipeline.tsx` | ✅ |
| PDF download (one click) | `api/pdf` + `lib/pdf.tsx` | ✅ |
| Discord bonus (token/channel/applicant, auto-send PDF) | Settings Discord tab + `api/discord` | ✅ |
| Responsive / mobile | Tailwind, collapsible sidebar drawer | ✅ (needs mobile spot-check) |
| Setup docs + env docs | `README.md`, `.env.example` | ✅ |
| Public deployment | Vercel | ⏳ pending |

---

## 5. Verified so far
- `npx tsc --noEmit` — clean.
- `npm run build` — success; routes: `/`, `/api/research`, `/api/pdf`, `/api/discord`.
- Dev server + browser: hero and Settings slide-over render correctly (screenshots taken).
- `next.config.ts`: `serverExternalPackages: ["@react-pdf/renderer"]` + turbopack root pinned.

## 6. NOT yet done / next steps
1. **Live end-to-end test** with real keys — the only thing left to prove the pipeline works:
   - Needs `OPENROUTER_API_KEY` (required) + `SERPER_API_KEY` (recommended) in `.env.local`, or pasted in Settings.
   - Test a real company (e.g. "Stripe") → watch pipeline → verify dossier → download PDF → (optional) Discord send.
2. **Mobile responsive spot-check.**
3. **Deploy to Vercel** (`npm i -g vercel`, `vercel`, `vercel --prod`); add env vars in dashboard or let evaluator paste keys.
4. Optional polish: dark/light nothing needed; consider caching, more example chips.

## 7. Keys / accounts status
- Serper: user has a key (2,500 queries). **Not yet placed in the repo.**
- OpenRouter: user getting a free key. **Pending.**
- Discord: evaluator provides bot token + channel ID; app has input fields ready.

## 8. How to run
```bash
npm install
cp .env.example .env.local   # add keys, or paste them in the UI Settings panel
npm run dev                  # http://localhost:3000
```

## 9. Git
- Repo initialized. Commits:
  1. design spec
  2. full Scout build (crawler, Serper, OpenRouter, PDF, Discord, SSE chat UI)
- `.gitignore` excludes `node_modules`, `.next`, `.env*`, `.vercel`.
