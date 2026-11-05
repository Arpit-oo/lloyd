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
  /** What is waiting: an edit to written assets (default) or a change to the plan. */
  kind?: "edit" | "plan";
  instruction: string;
  assetIds: string[];
  conflicts: { rule: string; source_doc: string | null; affects: string[] }[];
}
