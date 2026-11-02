import { db, newId } from "@/lib/db";

/**
 * Durable memory across campaigns. Kept deliberately small and visible:
 * - Only *active* memories are injected; *proposed* ones wait for the user to accept them.
 * - All active memories for the brand (plus brand-agnostic preferences) go in, pinned first, capped.
 *   With tens of memories, "all of them" is cheaper and more predictable than retrieval.
 * - Campaign-scoped brief overrides are never stored here; they live on the campaign.
 */
export type MemoryType = "preference" | "decision" | "fact" | "correction";
export type MemoryStatus = "proposed" | "active" | "archived";

export interface Memory {
  id: string;
  brand_hash: string | null;
  type: MemoryType;
  text: string;
  evidence: string | null;
  source_campaign_id: string | null;
  status: MemoryStatus;
  pinned: number;
  use_count: number;
  created_at: string;
  last_used_at: string | null;
}

export type MemoryForPrompt = Pick<Memory, "id" | "type" | "text">;

const MAX_INJECTED = 25;

export function listMemories(brandHash: string, statuses: MemoryStatus[] = ["active", "proposed"]): Memory[] {
  return db()
    .prepare(
      `SELECT * FROM memories WHERE (brand_hash = ? OR brand_hash IS NULL) AND status IN (${statuses.map(() => "?").join(",")})
       ORDER BY pinned DESC, status, created_at DESC`,
    )
    .all(brandHash, ...statuses) as Memory[];
}

export function memoriesForPrompt(brandHash: string): MemoryForPrompt[] {
  return listMemories(brandHash, ["active"]).slice(0, MAX_INJECTED).map(({ id, type, text }) => ({ id, type, text }));
}

export function markUsed(ids: string[]) {
  const stmt = db().prepare("UPDATE memories SET use_count = use_count + 1, last_used_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?");
  db().transaction(() => ids.forEach((id) => stmt.run(id)))();
}

export function addMemory(m: { brandHash: string | null; type: MemoryType; text: string; evidence?: string | null; sourceCampaignId?: string | null; status?: MemoryStatus }): string {
  const id = newId("mem");
  db()
    .prepare("INSERT INTO memories (id, brand_hash, type, text, evidence, source_campaign_id, status) VALUES (?,?,?,?,?,?,?)")
    .run(id, m.brandHash, m.type, m.text, m.evidence ?? null, m.sourceCampaignId ?? null, m.status ?? "proposed");
  return id;
}

export function updateMemory(id: string, patch: Partial<Pick<Memory, "text" | "type" | "status" | "pinned">>) {
  const cur = db().prepare("SELECT * FROM memories WHERE id = ?").get(id) as Memory | undefined;
  if (!cur) throw new Error(`Memory ${id} not found`);
  const next = { ...cur, ...patch };
  db().prepare("UPDATE memories SET text = ?, type = ?, status = ?, pinned = ? WHERE id = ?").run(next.text, next.type, next.status, next.pinned, id);
}

export function deleteMemory(id: string) {
  db().prepare("DELETE FROM memories WHERE id = ?").run(id);
}
