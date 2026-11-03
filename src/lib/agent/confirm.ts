/**
 * Replies to a "this goes against the brand, are you sure?" question. The buttons send these
 * exact texts; the agent matches them before routing. Shared by server and client.
 */
export const CONFIRM_REPLIES = {
  yes: "Yes, do it anyway",
  partial: "Only where the brand allows",
  no: "Cancel, leave it as is",
} as const;

export interface PendingEdit {
  instruction: string;
  assetIds: string[];
  conflicts: { rule: string; source_doc: string | null; affects: string[] }[];
}
