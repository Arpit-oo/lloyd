import { assetToText } from "@/lib/agent/asset-types";
import { getCampaign, getVersion, listAssets, listMessages, type MessageRow } from "@/lib/agent/store";
import type { BrandCheckItem, Plan, Questions } from "@/lib/agent/types";
import { campaignCost } from "@/lib/costs";
import { json } from "@/lib/http/sse";

/**
 * Downloads a campaign: `?format=md` (default) is a readable document with the conversation and
 * the current version of every asset; `?format=json` is the raw data, for archiving or tooling.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const campaign = getCampaign(id);
  if (!campaign) return json({ error: "Not found" }, 404);
  const format = new URL(req.url).searchParams.get("format") === "json" ? "json" : "md";
  const messages = listMessages(id);
  const assets = listAssets(id).map((a) => ({ ...a, current: a.current_version ? getVersion(a.id, a.current_version) : null }));
  const cost = campaignCost(id);
  const slug = campaign.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "campaign";

  const body =
    format === "json"
      ? JSON.stringify({ exportedAt: new Date().toISOString(), campaign, messages, assets, cost }, null, 2)
      : toMarkdown(campaign.title, campaign.state, messages, assets, cost.totalUSD);
  return new Response(body, {
    headers: {
      "Content-Type": format === "json" ? "application/json; charset=utf-8" : "text/markdown; charset=utf-8",
      "Content-Disposition": `attachment; filename="${slug}.${format}"`,
    },
  });
}

function toMarkdown(
  title: string,
  state: string,
  messages: MessageRow[],
  assets: { title: string; type: string; current_version: number; current: { content: unknown; guard: unknown } | null }[],
  usd: number,
): string {
  const out: string[] = [`# ${title}`, "", `Exported ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC · state: ${state} · model cost so far: $${usd.toFixed(3)}`, ""];

  out.push("## Conversation", "");
  for (const m of messages) out.push(...messageToMarkdown(m), "");

  if (assets.length) {
    out.push("## Assets", "");
    for (const a of assets) {
      out.push(`### ${a.title}`, "", `*${a.type.replace(/_/g, " ")} · version ${a.current_version}${guardLine(a.current?.guard)}*`, "");
      out.push(a.current ? assetToText(a.current.content as Parameters<typeof assetToText>[0]).trim() : "_Not written yet._", "");
    }
  }
  return out.join("\n");
}

function guardLine(guard: unknown): string {
  const g = guard as { status?: string; issues?: unknown[] } | null;
  if (!g?.status) return "";
  return ` · brand check: ${g.status}${g.issues?.length ? ` (${g.issues.length} note${g.issues.length > 1 ? "s" : ""})` : ""}`;
}

function messageToMarkdown(m: MessageRow): string[] {
  const c = m.content as Record<string, unknown>;
  if (m.role === "user") {
    const files = (c.attachments as { name: string }[] | undefined) ?? [];
    return [`**${String(c.author ?? "You")}:**`, "", quote(String(c.text ?? "")), ...(files.length ? ["", `> Attached: ${files.map((f) => f.name).join(", ")}`] : [])];
  }
  const lines = ["**Lloyd:**", ""];
  switch (m.kind) {
    case "brand_check":
      for (const i of (c.items as BrandCheckItem[]) ?? []) {
        lines.push(`- **${i.verdict === "ok" ? "OK" : i.verdict === "conflict" ? "Won't do" : "Changed"}:** ${i.requested}. ${i.rule}${i.source_doc ? ` (${i.source_doc})` : ""}${i.alternative ? ` Instead: ${i.alternative}` : ""}`);
      }
      break;
    case "questions": {
      const q = c as unknown as Questions;
      q.questions.forEach((x, n) => lines.push(`${n + 1}. ${x.question} Options: ${x.options.join(" / ")}. Default: ${x.default}.`));
      if (q.assumptions.length) lines.push("", "Assumed:", ...q.assumptions.map((a) => `- ${a}`));
      break;
    }
    case "plan": {
      const p = c.plan as Plan;
      lines.push(p.summary, "", ...p.items.map((i) => `- **${i.title}** (${i.type.replace(/_/g, " ")}): ${i.angle}`));
      break;
    }
    case "assets": {
      const g = c.guard as { pass: number; warn: number; block: number };
      lines.push(`Wrote ${c.count} assets. Brand check: ${g.pass} pass, ${g.warn} with notes, ${g.block} blocked.`);
      break;
    }
    case "edit":
      for (const r of (c.results as { title: string; summary: string; version: number }[]) ?? []) lines.push(`- Edited **${r.title}** (v${r.version}): ${r.summary}`);
      break;
    case "confirm":
      lines.push(`Asked before an off-brand edit: ${String(c.question ?? "")}`);
      break;
    case "memory":
      lines.push(`Suggested ${(c.proposedIds as string[] | undefined)?.length ?? 0} things to remember for next time.`);
      break;
    default:
      lines.push(String(c.text ?? ""));
  }
  return lines;
}

const quote = (t: string) => t.split("\n").map((l) => `> ${l}`).join("\n");
