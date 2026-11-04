import { db, newId } from "@/lib/db";
import type { AssetContent, AssetType } from "./asset-types";
import type { CampaignData, CampaignState } from "./types";

/** Persistence for campaigns, chat messages and asset versions. Plain SQL, no ORM. */

export interface CampaignRow {
  id: string;
  brand_hash: string;
  title: string;
  state: CampaignState;
  data: CampaignData;
  created_at: string;
  updated_at: string;
}

export interface MessageRow {
  id: string;
  role: "user" | "assistant";
  kind: string;
  content: unknown;
  created_at: string;
}

export interface AssetRow {
  id: string;
  campaign_id: string;
  plan_item_id: string;
  ord: number;
  type: AssetType;
  title: string;
  status: "writing" | "ready" | "error";
  current_version: number;
}

export interface AssetVersionRow {
  version: number;
  content: AssetContent;
  guard: unknown;
  sources: unknown;
  instruction: string | null;
  created_at: string;
}

export function createCampaign(brandHash: string, title: string): CampaignRow {
  const id = newId("cmp");
  db().prepare("INSERT INTO campaigns (id, brand_hash, title, state, data_json) VALUES (?,?,?,?,?)").run(id, brandHash, title, "new", "{}");
  return getCampaign(id)!;
}

export function getCampaign(id: string): CampaignRow | null {
  const r = db().prepare("SELECT * FROM campaigns WHERE id = ?").get(id) as (Omit<CampaignRow, "data"> & { data_json: string }) | undefined;
  return r ? { ...r, data: JSON.parse(r.data_json) } : null;
}

export function listCampaigns(brandHash: string): Pick<CampaignRow, "id" | "title" | "state" | "updated_at">[] {
  return db()
    .prepare("SELECT id, title, state, updated_at FROM campaigns WHERE brand_hash = ? ORDER BY updated_at DESC")
    .all(brandHash) as Pick<CampaignRow, "id" | "title" | "state" | "updated_at">[];
}

export function updateCampaign(id: string, patch: { state?: CampaignState; title?: string; data?: Partial<CampaignData> }) {
  const current = getCampaign(id);
  if (!current) throw new Error(`Campaign ${id} not found`);
  const data = patch.data ? { ...current.data, ...patch.data } : current.data;
  db()
    .prepare("UPDATE campaigns SET state = ?, title = ?, data_json = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?")
    .run(patch.state ?? current.state, patch.title ?? current.title, JSON.stringify(data), id);
}

export function deleteCampaign(id: string) {
  db().prepare("DELETE FROM campaigns WHERE id = ?").run(id);
}

export function addMessage(campaignId: string, role: MessageRow["role"], kind: string, content: unknown): MessageRow {
  const id = newId("msg");
  db().prepare("INSERT INTO messages (id, campaign_id, role, kind, content_json) VALUES (?,?,?,?,?)").run(id, campaignId, role, kind, JSON.stringify(content));
  return { id, role, kind, content, created_at: new Date().toISOString() };
}

/** Saves a finished run's steps on the last assistant message it wrote, for the "Worked for" checklist. */
export function attachRunLog(campaignId: string, since: number, log: { steps: { text: string; at: number }[]; startedAt: number; endedAt: number }) {
  const rows = listMessages(campaignId).filter((m) => m.role === "assistant" && Date.parse(m.created_at) >= since - 1000);
  const last = rows.at(-1);
  if (!last || !log.steps.length) return;
  db().prepare("UPDATE messages SET content_json = ? WHERE id = ?").run(JSON.stringify({ ...(last.content as object), runLog: log }), last.id);
}

export function listMessages(campaignId: string): MessageRow[] {
  return (db().prepare("SELECT id, role, kind, content_json, created_at FROM messages WHERE campaign_id = ? ORDER BY created_at, rowid").all(campaignId) as (Omit<MessageRow, "content"> & { content_json: string })[]).map(
    (m) => ({ id: m.id, role: m.role, kind: m.kind, content: JSON.parse(m.content_json), created_at: m.created_at }),
  );
}

export function createAsset(campaignId: string, planItemId: string, ord: number, type: AssetType, title: string): AssetRow {
  const id = newId("ast");
  db().prepare("INSERT INTO assets (id, campaign_id, plan_item_id, ord, type, title, status) VALUES (?,?,?,?,?,?,?)").run(id, campaignId, planItemId, ord, type, title, "writing");
  return getAsset(id)!;
}

export function getAsset(id: string): AssetRow | null {
  return (db().prepare("SELECT * FROM assets WHERE id = ?").get(id) as AssetRow | undefined) ?? null;
}

export function listAssets(campaignId: string): AssetRow[] {
  return db().prepare("SELECT * FROM assets WHERE campaign_id = ? ORDER BY ord").all(campaignId) as AssetRow[];
}

export function setAssetStatus(id: string, status: AssetRow["status"]) {
  db().prepare("UPDATE assets SET status = ? WHERE id = ?").run(status, id);
}

/** Appends a version and makes it current. Earlier versions are kept for diff and undo. */
export function addVersion(assetId: string, v: { content: AssetContent; guard?: unknown; sources?: unknown; instruction?: string | null }): number {
  const next = ((db().prepare("SELECT COALESCE(MAX(version),0) v FROM asset_versions WHERE asset_id = ?").get(assetId) as { v: number }).v ?? 0) + 1;
  db().transaction(() => {
    db()
      .prepare("INSERT INTO asset_versions (id, asset_id, version, content_json, guard_json, sources_json, instruction) VALUES (?,?,?,?,?,?,?)")
      .run(newId("ver"), assetId, next, JSON.stringify(v.content), JSON.stringify(v.guard ?? null), JSON.stringify(v.sources ?? null), v.instruction ?? null);
    db().prepare("UPDATE assets SET current_version = ?, status = 'ready' WHERE id = ?").run(next, assetId);
  })();
  return next;
}

export function setVersionGuard(assetId: string, version: number, guard: unknown) {
  db().prepare("UPDATE asset_versions SET guard_json = ? WHERE asset_id = ? AND version = ?").run(JSON.stringify(guard), assetId, version);
}

export function setCurrentVersion(assetId: string, version: number) {
  db().prepare("UPDATE assets SET current_version = ? WHERE id = ?").run(version, assetId);
}

export function getVersion(assetId: string, version: number): AssetVersionRow | null {
  const r = db().prepare("SELECT version, content_json, guard_json, sources_json, instruction, created_at FROM asset_versions WHERE asset_id = ? AND version = ?").get(assetId, version) as
    | { version: number; content_json: string; guard_json: string | null; sources_json: string | null; instruction: string | null; created_at: string }
    | undefined;
  if (!r) return null;
  return { version: r.version, content: JSON.parse(r.content_json), guard: r.guard_json ? JSON.parse(r.guard_json) : null, sources: r.sources_json ? JSON.parse(r.sources_json) : null, instruction: r.instruction, created_at: r.created_at };
}

export function listVersions(assetId: string): Pick<AssetVersionRow, "version" | "instruction" | "created_at">[] {
  return db().prepare("SELECT version, instruction, created_at FROM asset_versions WHERE asset_id = ? ORDER BY version").all(assetId) as Pick<AssetVersionRow, "version" | "instruction" | "created_at">[];
}
