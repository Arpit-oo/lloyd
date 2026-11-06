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
export const ACTIONS = ["answer_questions", "use_defaults", "revise_plan", "approve_plan", "edit_assets", "undo_edit", "finish_campaign", "remember", "new_brief", "chat"] as const;
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
  new: ["remember", "chat"],
  clarifying: ["answer_questions", "use_defaults", "new_brief", "remember", "chat"],
  plan_review: ["revise_plan", "approve_plan", "new_brief", "remember", "chat"],
  writing: ["remember", "chat"],
  review: ["edit_assets", "undo_edit", "revise_plan", "finish_campaign", "remember", "chat"],
};

export async function routeMessage(
  input: { state: CampaignState; message: string; plan?: Plan; assets: AssetRow[]; recent: string; brief?: string; attachments?: { name: string; text: string }[] },
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
- revise_plan: change the asset plan (add, drop, change an asset). "X post", "x post", "tweet" or "thread" means a post on X (Twitter), not "times"; "1 x post" = one X post. Words like "healthcare one" set the audience of the asset next to them. approve_plan: they approve the plan / say go / write it.
- edit_assets: change the content of one or more written assets. Resolve ordinal references ("second post" = second asset of that kind in list order; "the email" when there are several is ambiguous).
- undo_edit: revert the last edit. finish_campaign: they are done with this campaign.
- remember: they ask you to remember, save or always use something for future campaigns ("remember this", "from now on", "always use…", "keep this for next time"). Never claim in a chat reply that you will remember something; that is this action.
- new_brief: they are giving the campaign brief now, pasted into the message or attached to it ("here is the brief", "use this brief instead", "start over with this"). Use it when the brief on file is not a real brief (a greeting or a question) and this message contains or attaches one, or when they ask to replace the brief.
- chat: a question or comment; answer it in reply, briefly. Answer questions about the brief, the plan or the assets from the material below; never ask the marketer to share something that is already there. Files attached to the new message are listed with it: never say you cannot see a listed attachment.
needs_clarification: only when you truly cannot act (e.g. "the email" with three emails and nothing else to tell them apart). For plan changes, choose the reading that fits the brief best and act; the marketer can see and change the plan. Never ask about something the message already says, and never ask a question that was already asked in the recent conversation.
Chat replies: answer what they actually said, like a helpful colleague. Thanks or small talk gets a short friendly reply; a general marketing or writing question gets a real answer; an opinion gets a view. Don't fall back to "How can I help with your campaign?". When the assets are written (state review), you can mention one concrete next step if it fits (edit an asset, share or export the chat). If they paste or ask for a whole new campaign, say the New campaign button (top of the sidebar) starts one, so this one stays as it is. Plain words, no em dashes.` }],
    input: `State: ${input.state}\n\n${input.brief ? `Campaign brief (as the marketer sent it):\n"""\n${input.brief.slice(0, 6000)}\n"""\n\n` : ""}${input.attachments?.length ? `Files attached to the new message:\n${input.attachments.map((a) => `--- ${a.name} ---\n${a.text.slice(0, 1500)}`).join("\n\n")}\n\n` : ""}Assets:\n${assetList}\n\nRecent conversation:\n${input.recent}\n\nNew message:\n"${input.message}"`,
    schema: RouteSchema,
    schemaName: "route",
    ctx,
  });
  const route = res.data;
  if (!ALLOWED[input.state].includes(route.action)) return { ...route, action: "chat", reply: route.reply ?? `I can't do that while the campaign is in "${input.state}".` };
  return route;
}
