/**
 * End-to-end accuracy harness. Runs the real pipeline (resolve → crawl →
 * Serper → analyze) against a set of companies and prints every field so you
 * can fact-check against ground truth. Also live-tests each dropdown model.
 *
 * Usage:
 *   OPENROUTER_API_KEY=... SERPER_API_KEY=... npx tsx scripts/accuracy-test.ts
 */
import { resolveTarget } from "../lib/resolve";
import { crawlSite } from "../lib/crawl";
import { gatherPublicInfo, findCompetitorCandidates } from "../lib/serper";
import { analyzeCompany } from "../lib/ai";
import { MODEL_OPTIONS, DEFAULT_MODEL } from "../lib/types";

const OR = process.env.OPENROUTER_API_KEY;
const SERP = process.env.SERPER_API_KEY;

if (!OR) {
  console.error("Set OPENROUTER_API_KEY (and ideally SERPER_API_KEY).");
  process.exit(1);
}

// 1 large, 1 large, 1 obscure, 1 generic-name, 1 JS-heavy.
const COMPANIES = ["Stripe", "Notion", "https://videosdk.live", "Apple", "https://linear.app"];

async function runOne(input: string) {
  console.log("\n" + "=".repeat(70) + `\nINPUT: ${input}`);
  const resolved = await resolveTarget(input, SERP);
  console.log(`resolved: ${resolved.name} → ${resolved.website || "(no site)"}`);

  const crawl = resolved.website ? await crawlSite(resolved.website) : { pages: [], sources: [], enrichment: { socials: [] } };
  console.log(`crawled ${crawl.pages.length} pages, ${crawl.pages.reduce((n, p) => n + p.text.length, 0)} chars`);
  console.log(`siteName: ${crawl.enrichment.siteName || "—"} | logo: ${crawl.enrichment.logo || "—"} | socials: ${crawl.enrichment.socials.map((s) => s.type).join(", ") || "—"}`);

  let snippets: string[] = [];
  let compSnippets: string[] = [];
  let phone, address;
  if (SERP) {
    const [pub, comp] = await Promise.all([gatherPublicInfo(resolved.name, SERP), findCompetitorCandidates(resolved.name, SERP)]);
    snippets = pub.snippets;
    compSnippets = comp.snippets;
    phone = pub.phone;
    address = pub.address;
  }

  const report = await analyzeCompany(
    {
      name: resolved.name,
      website: resolved.website,
      crawledPages: crawl.pages,
      searchSnippets: snippets,
      competitorSnippets: compSnippets,
      knownPhone: phone,
      knownAddress: address,
    },
    { openrouterKey: OR! },
    DEFAULT_MODEL,
    crawl.sources,
  );

  const c = report.company;
  console.log(`\nMODEL USED: ${report.model}`);
  console.log(`NAME:    ${c.name}`);
  console.log(`PHONE:   ${c.phone || "(blank)"}`);
  console.log(`ADDRESS: ${c.address || "(blank)"}`);
  console.log(`SUMMARY: ${c.summary}`);
  console.log(`PRODUCTS: ${c.products.join(", ")}`);
  console.log(`PAIN POINTS:\n  - ${c.painPoints.join("\n  - ")}`);
  console.log(`COMPETITORS:\n  - ${report.competitors.map((x) => `${x.name} (${x.website})`).join("\n  - ")}`);
  console.log(`CONFIDENCE: ${JSON.stringify(report.confidence)}`);
}

async function testModels() {
  console.log("\n" + "#".repeat(70) + "\nLIVE MODEL CHECK\n" + "#".repeat(70));
  for (const m of MODEL_OPTIONS) {
    try {
      const rep = await analyzeCompany(
        { name: "Stripe", website: "https://stripe.com", crawledPages: [{ url: "https://stripe.com", title: "Stripe", text: "Stripe builds economic infrastructure for the internet. Payments, billing, and financial APIs for businesses." }], searchSnippets: [], competitorSnippets: [] },
        { openrouterKey: OR!, groqKey: process.env.GROQ_API_KEY },
        m.id,
      );
      const ok = rep.company.summary.length > 0 && rep.model === m.id;
      console.log(`${ok ? "PASS" : "WEAK"} ${m.id} → produced by ${rep.model}, summary ${rep.company.summary.length} chars`);
    } catch (e) {
      console.log(`FAIL ${m.id} → ${e instanceof Error ? e.message : e}`);
    }
  }
}

(async () => {
  await testModels();
  for (const co of COMPANIES) {
    try {
      await runOne(co);
    } catch (e) {
      console.error(`ERROR on ${co}:`, e instanceof Error ? e.message : e);
    }
  }
  console.log("\nDone. Fact-check phone/address/products against each real site.");
})();
