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

/** Texts the plan card's buttons send. A button click is never the answer to a pending clarifying question. */
export const PLAN_REPLIES = {
  approve: "Looks good. Write it.",
  removePrefix: "Remove these from the plan: ",
} as const;

export function isButtonReply(text: string): boolean {
  return text === PLAN_REPLIES.approve || text.startsWith(PLAN_REPLIES.removePrefix) || Object.values(CONFIRM_REPLIES).includes(text as never);
}
