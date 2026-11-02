import { z } from "zod";
import { llm, type CallContext } from "@/lib/llm/client";
import { ASSET_LABEL } from "../asset-types";
import type { AssetRow } from "../store";
import type { CampaignState, Plan } from "../types";

/**
 * Classifies each chat message into one action the state machine can run, and resolves
 * references like "the second post" or "the security email" to concrete asset ids.
 * Ambiguous references are not guessed: the router asks.
 */
export const ACTIONS = ["answer_questions", "use_defaults", "revise_plan", "approve_plan", "edit_assets", "undo_edit", "finish_campaign", "chat"] as const;
export type Action = (typeof ACTIONS)[number];

const RouteSchema = z.object({
  action: z.enum(ACTIONS),
  asset_ids: z.array(z.string()).describe("Assets the message refers to, for edit_assets/undo_edit. Use ids from the list."),
  instruction: z.string().nullable().describe("The edit or plan change, restated clearly and self-contained."),
  needs_clarification: z.string().nullable().describe("If the reference is ambiguous, the question to ask instead of acting."),
  reply: z.string().nullable().describe("For 'chat': the answer to the user's question about the campaign or the brand rules."),
});
export type Route = z.infer<typeof RouteSchema>;

const ALLOWED: Record<CampaignState, Action[]> = {
  new: ["chat"],
  clarifying: ["answer_questions", "use_defaults", "chat"],
  plan_review: ["revise_plan", "approve_plan", "chat"],
  writing: ["chat"],
  review: ["edit_assets", "undo_edit", "revise_plan", "finish_campaign", "chat"],
};

export async function routeMessage(
  input: { state: CampaignState; message: string; plan?: Plan; assets: AssetRow[]; recent: string },
  ctx: CallContext,
): Promise<Route> {
  const assetList = input.assets.length
    ? input.assets.map((a, i) => `${i + 1}. id=${a.id} | ${ASSET_LABEL[a.type]} | ${a.title}`).join("\n")
    : input.plan?.items.map((p, i) => `${i + 1}. plan item ${p.id} | ${ASSET_LABEL[p.type]} | ${p.title}`).join("\n") ?? "none";

  const res = await llm.json({
    step: "route",
    tier: "fast",
    effort: "low",
    system: [{ text: `You route a marketer's chat message in a campaign tool to one action.
Allowed actions in the current state: ${ALLOWED[input.state].join(", ")}.
- answer_questions: they answered the agent's questions. use_defaults: they want the agent's default answers.
- revise_plan: change the asset plan (add, drop, change an asset). approve_plan: they approve the plan / say go / write it.
- edit_assets: change the content of one or more written assets. Resolve ordinal references ("second post" = second asset of that kind in list order; "the email" when there are several is ambiguous).
- undo_edit: revert the last edit. finish_campaign: they are done with this campaign.
- chat: a question or comment; answer it in reply, briefly.` }],
    input: `State: ${input.state}\n\nAssets:\n${assetList}\n\nRecent conversation:\n${input.recent}\n\nNew message:\n"${input.message}"`,
    schema: RouteSchema,
    schemaName: "route",
    ctx,
  });
  const route = res.data;
  if (!ALLOWED[input.state].includes(route.action)) return { ...route, action: "chat", reply: route.reply ?? `I can't do that while the campaign is in "${input.state}".` };
  return route;
}
