import { z } from "zod";
import { llm, type CallContext } from "@/lib/llm/client";
import type { BrandDB } from "./store";

/**
 * Registry of named things (company, products, events, features) with their current names,
 * former names and status. Renames are an entity-level fact that sentence similarity misses:
 * old posts say "Tallowatch finds risky configs", the new guide says "the posture product is
 * Evenburn", and those sentences are not alike. The registry also feeds a deterministic guard
 * check: a former name in new copy is flagged without a model call.
 */
export const EntitySchema = z.object({
  current_name: z.string().describe("Name exactly as it must be written today, full form."),
  short_name: z.string().nullable().describe("Allowed short form after first mention, if stated."),
  kind: z.enum(["company", "product", "event", "feature", "program", "other"]),
  status: z.string().describe("e.g. current, early access, general availability, retired."),
  former_names: z.array(z.string()).describe("Names no longer to be used in new copy."),
  former_name_rule: z.string().nullable().describe("When, if ever, a former name may still appear (e.g. 'formerly X' for a limited time)."),
  evidence: z.string().describe("Verbatim quote establishing the current name or rename."),
  source_doc: z.string(),
});
export type Entity = z.infer<typeof EntitySchema>;

export async function buildEntityRegistry(bdb: BrandDB, ctx: CallContext): Promise<Entity[]> {
  const docs = bdb.prepare("SELECT id, tier, card_json FROM docs ORDER BY tier, id").all() as { id: string; tier: number; card_json: string }[];
  const mentions = docs
    .map((d) => {
      const c = JSON.parse(d.card_json);
      return c.products.length ? `- ${d.id} (tier ${d.tier}, ${c.status}, ${c.stated_date ?? "undated"}): ${c.products.join(", ")}` : null;
    })
    .filter(Boolean)
    .join("\n");
  const naming = (
    bdb
      .prepare(`SELECT f.doc_id, f.statement, f.quote, d.tier FROM facts f JOIN docs d ON d.id = f.doc_id
                WHERE f.kind IN ('naming_rule','company_fact','status_or_date') ORDER BY d.tier LIMIT 400`)
      .all() as { doc_id: string; statement: string; quote: string; tier: number }[]
  )
    .map((f) => `- [${f.doc_id}, tier ${f.tier}] ${f.statement} ("${f.quote}")`)
    .join("\n");

  const res = await llm.json({
    step: "ingest:entities",
    tier: "reasoner",
    effort: "medium",
    system: [{ text: `Build a registry of the brand's named entities (company, products, events, named features/programs).
Work out each one's CURRENT name and status, and every former name that must not be used in new copy.
Higher-authority documents (lower tier number) decide. Old documents using an old name are evidence of the old name, not a reason to keep it.
Quote evidence verbatim. Skip third-party companies, competitors and customers.` }],
    input: [
      { label: "product mentions by document", text: `Names mentioned per document:\n${mentions}` },
      { label: "naming facts", text: `Naming and company facts:\n${naming}` },
    ],
    schema: z.object({ entities: z.array(EntitySchema) }),
    schemaName: "entities",
    ctx,
  });
  return res.data.entities;
}

/** Former names found in text, with the entity they belong to. Word-boundary, case-insensitive. */
export function findFormerNames(text: string, entities: Entity[]): { found: string; entity: Entity }[] {
  const hits: { found: string; entity: Entity }[] = [];
  for (const e of entities)
    for (const name of e.former_names) {
      // A former name that is a prefix of the current name ("Acme" -> "Acme Cloud") is not a hit by itself.
      if (e.current_name.toLowerCase().includes(name.toLowerCase())) continue;
      const re = new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
      if (re.test(text)) hits.push({ found: name, entity: e });
    }
  return hits;
}
