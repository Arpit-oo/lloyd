"use client";

import { Brain, Library, Loader2, Plus, ScrollText } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { getJSON, sendJSON, streamMessage, usd } from "@/lib/client/api";
import type { BrandView, CampaignListItem, CampaignView } from "@/lib/client/types";
import { AssetPanel } from "./assets/asset-panel";
import { Chat } from "./chat/chat";
import { BrandPanel } from "./panels/brand-panel";
import { InspectorPanel } from "./panels/inspector-panel";
import { MemoryPanel } from "./panels/memory-panel";
import { IngestScreen } from "./ingest-screen";

type Panel = "brand" | "memory" | "inspector" | null;
type View = CampaignView & { turnCost: Record<string, number> };

const STATE_LABEL: Record<string, string> = { new: "New", clarifying: "Questions", plan_review: "Plan", writing: "Writing", review: "Assets" };

/** App shell: campaigns on the left, chat in the middle, rendered assets on the right. */
export function Workspace() {
  const [brand, setBrand] = useState<BrandView | null>(null);
  const [campaigns, setCampaigns] = useState<CampaignListItem[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [view, setView] = useState<View | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [selectedAsset, setSelectedAsset] = useState<string | null>(null);
  const [panel, setPanel] = useState<Panel>(null);

  const loadBrand = useCallback(() => getJSON<BrandView>("/api/brand").then(setBrand), []);
  const loadCampaigns = useCallback(() => getJSON<CampaignListItem[]>("/api/campaigns").then(setCampaigns), []);
  const loadView = useCallback(async (id: string) => setView(await getJSON<View>(`/api/campaigns/${id}`)), []);

  useEffect(() => {
    loadBrand();
    loadCampaigns().catch(() => {});
  }, [loadBrand, loadCampaigns]);

  const openCampaign = useCallback(
    async (id: string) => {
      setActiveId(id);
      setSelectedAsset(null);
      await loadView(id);
    },
    [loadView],
  );

  const newCampaign = async () => {
    const c = await sendJSON<CampaignListItem>("/api/campaigns", "POST");
    await loadCampaigns();
    await openCampaign(c.id);
  };

  const send = async (text: string) => {
    let id = activeId;
    if (!id) {
      const c = await sendJSON<CampaignListItem>("/api/campaigns", "POST");
      id = c.id;
      await openCampaign(id);
    }
    setBusy(true);
    setStatus("Thinking");
    // Show the user's message immediately; the server copy replaces it on reload.
    setView((v) => (v ? { ...v, messages: [...v.messages, { id: `local-${Date.now()}`, role: "user", kind: "text", content: { text }, created_at: "" }] } : v));
    try {
      await streamMessage(id, text, (e) => {
        if (e.type === "status") setStatus(e.text);
        if (e.type === "message" || e.type === "asset" || e.type === "state") loadView(id!);
        if (e.type === "asset") setSelectedAsset((s) => s ?? e.assetId);
        if (e.type === "error") setStatus(`Error: ${e.text}`);
      });
    } finally {
      setBusy(false);
      setStatus(null);
      await Promise.all([loadView(id), loadCampaigns()]);
    }
  };

  if (!brand) return <div className="flex h-full items-center justify-center text-muted"><Loader2 className="animate-spin" /></div>;
  if (!brand.ready) return <IngestScreen onDone={loadBrand} />;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex h-12 shrink-0 items-center gap-4 border-b border-line bg-white px-4">
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold">Campaign Agent</span>
          <span className="text-muted">/</span>
          <span className="text-sm">{brand.tokens?.brand_name ?? "Brand"}</span>
        </div>
        <div className="ml-auto flex items-center gap-1">
          {view && (
            <span className="mr-2 rounded-full bg-panel px-3 py-1 text-xs text-muted ring-1 ring-line" title="Cost of this campaign so far">
              {usd(view.cost.totalUSD)} · {Math.round(view.cost.cacheHitRate * 100)}% cached
            </span>
          )}
          <HeaderButton icon={<Library size={15} />} label="Brand" onClick={() => setPanel("brand")} />
          <HeaderButton icon={<Brain size={15} />} label="Memory" onClick={() => setPanel("memory")} />
          <HeaderButton icon={<ScrollText size={15} />} label="Inspector" onClick={() => setPanel("inspector")} disabled={!view} />
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside className="flex w-56 shrink-0 flex-col border-r border-line bg-panel">
          <button onClick={newCampaign} className="m-3 flex items-center justify-center gap-1.5 rounded-lg bg-ink px-3 py-2 text-sm font-semibold text-white">
            <Plus size={15} /> New campaign
          </button>
          <ul className="min-h-0 flex-1 space-y-0.5 overflow-y-auto px-2 pb-3">
            {campaigns.map((c) => (
              <li key={c.id}>
                <button onClick={() => openCampaign(c.id)} className={`w-full rounded-lg px-3 py-2 text-left ${c.id === activeId ? "bg-white shadow-sm ring-1 ring-line" : "hover:bg-white/60"}`}>
                  <div className="truncate text-[13px] font-medium">{c.title}</div>
                  <div className="text-[11px] text-muted">{STATE_LABEL[c.state] ?? c.state}</div>
                </button>
              </li>
            ))}
          </ul>
        </aside>

        <section className="flex w-[440px] shrink-0 flex-col border-r border-line bg-[#f5f5f4]">
          <Chat view={view} busy={busy} status={status} turnCost={view?.turnCost ?? {}} onSend={send} onOpenAsset={setSelectedAsset} />
        </section>

        <main className="min-w-0 flex-1 bg-[#eceae7]">
          <AssetPanel assets={view?.assets ?? []} tokens={brand.tokens} selected={selectedAsset} onSelect={setSelectedAsset} onChanged={() => activeId && loadView(activeId)} />
        </main>
      </div>

      {panel === "brand" && <BrandPanel brand={brand} onClose={() => setPanel(null)} />}
      {panel === "memory" && <MemoryPanel onClose={() => setPanel(null)} />}
      {panel === "inspector" && view && <InspectorPanel view={view} onClose={() => setPanel(null)} />}
    </div>
  );
}

function HeaderButton({ icon, label, onClick, disabled }: { icon: React.ReactNode; label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button onClick={onClick} disabled={disabled} className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm text-muted hover:bg-panel hover:text-ink disabled:opacity-30">
      {icon}
      {label}
    </button>
  );
}
