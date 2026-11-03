/**
 * Who has a campaign open right now. Each browser tab sends a heartbeat (its tab id and display
 * name) when it refreshes the campaign; a viewer counts as present for 12 seconds after that.
 * In memory only: presence is live state, not history.
 */
export interface Viewer {
  id: string;
  name: string;
  seen: number;
}

const TTL_MS = 12_000;
const g = globalThis as unknown as { __presence?: Map<string, Map<string, Viewer>> };
const all = () => (g.__presence ??= new Map());

export function heartbeat(campaignId: string, viewerId: string, name: string) {
  if (!viewerId) return;
  let room = all().get(campaignId);
  if (!room) all().set(campaignId, (room = new Map()));
  room.set(viewerId, { id: viewerId, name: name.trim().slice(0, 40) || "Guest", seen: Date.now() });
}

export function viewers(campaignId: string): Viewer[] {
  const room = all().get(campaignId);
  if (!room) return [];
  const now = Date.now();
  for (const [id, v] of room) if (now - v.seen > TTL_MS) room.delete(id);
  return [...room.values()].sort((a, b) => a.seen - b.seen);
}
