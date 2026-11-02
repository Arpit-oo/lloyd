import { z } from "zod";
import { getConfig } from "@/lib/config";
import { llm, type CallContext } from "@/lib/llm/client";

/**
 * Web research for one asset, with verification:
 *  1. Firecrawl search + scrape the top pages.
 *  2. A fast model pulls candidate facts with publisher and publication date.
 *  3. Code checks that the figure really appears on the scraped page. Anything that fails
 *     is dropped and reported, never handed to the writer.
 * Brand rules on statistic age are applied by the writer and guard against the asset's publish date.
 */
export interface ResearchFinding {
  claim: string;
  figure: string;
  publisher: string;
  published: string | null;
  url: string;
  verified: boolean;
}

const FindingsSchema = z.object({
  findings: z.array(
    z.object({
      claim: z.string().describe("The fact in one sentence."),
      figure: z.string().describe("The exact number or phrase as it appears on the page, e.g. '67%'."),
      publisher: z.string().describe("The organization that published the original data, not a site quoting it."),
      published: z.string().nullable().describe("Publication date of the original source, ISO."),
      url: z.string(),
      is_primary_source: z.boolean().describe("False if the page only quotes another source."),
    }),
  ),
});

interface Page {
  url: string;
  markdown: string;
}

export async function research(question: string, ctx: CallContext): Promise<{ findings: ResearchFinding[]; rejected: string[] }> {
  const key = getConfig().FIRECRAWL_API_KEY;
  if (!key) return { findings: [], rejected: ["FIRECRAWL_API_KEY not set"] };

  const pages = await searchAndScrape(question, key);
  if (!pages.length) return { findings: [], rejected: ["No search results"] };

  const res = await llm.json({
    step: "research:extract",
    tier: "fast",
    effort: "low",
    system: [{ text: "Extract specific, citable facts that answer the question. Only facts stated on the pages. Prefer recent primary sources (surveys, reports by named organizations). Copy the figure exactly as written." }],
    input: `Question: ${question}\n\n${pages.map((p) => `## ${p.url}\n${p.markdown.slice(0, 12_000)}`).join("\n\n")}`,
    schema: FindingsSchema,
    schemaName: "findings",
    ctx,
  });

  const findings: ResearchFinding[] = [];
  const rejected: string[] = [];
  for (const f of res.data.findings) {
    const page = pages.find((p) => p.url === f.url);
    const onPage = !!page && normalize(page.markdown).includes(normalize(f.figure));
    if (!onPage) rejected.push(`"${f.figure}" not found on ${f.url}`);
    else if (!f.is_primary_source) rejected.push(`"${f.figure}" from ${f.url} quotes another source; not traced to the original`);
    else findings.push({ claim: f.claim, figure: f.figure, publisher: f.publisher, published: f.published, url: f.url, verified: true });
  }
  return { findings, rejected };
}

export function renderResearch(r: { findings: ResearchFinding[]; rejected: string[] }): string {
  if (!r.findings.length) return "# Web research\nNo verified third-party facts. Do not use outside statistics.";
  return `# Web research (verified on page; follow the brand's rules for third-party statistics: name the publisher, give the date and link, check its age against the publish date)\n${r.findings
    .map((f) => `- ${f.claim} [figure: ${f.figure}; publisher: ${f.publisher}; published: ${f.published ?? "unknown"}; ${f.url}]`)
    .join("\n")}`;
}

async function searchAndScrape(query: string, key: string): Promise<Page[]> {
  const res = await fetch("https://api.firecrawl.dev/v2/search", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query, limit: 4, scrapeOptions: { formats: ["markdown"], onlyMainContent: true } }),
  });
  if (!res.ok) return [];
  const body = (await res.json()) as { data?: { web?: { url: string; markdown?: string }[] } | { url: string; markdown?: string }[] };
  const items = Array.isArray(body.data) ? body.data : body.data?.web ?? [];
  return items.filter((i) => i.markdown).map((i) => ({ url: i.url, markdown: i.markdown! }));
}

const normalize = (s: string) => s.toLowerCase().replace(/\s+/g, " ").replace(/[  ]/g, " ");
