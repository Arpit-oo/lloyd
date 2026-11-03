import { currentBrandHash } from "@/lib/brand";
import { createCampaign, listCampaigns } from "@/lib/agent/store";
import { json } from "@/lib/http/sse";

export async function GET() {
  return json(listCampaigns(currentBrandHash()));
}

export async function POST() {
  return json(createCampaign(currentBrandHash(), "New campaign"), 201);
}
