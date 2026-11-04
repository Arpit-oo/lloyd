"use client";

import type { AgentEvent } from "@/lib/agent/agent";
import type { ModelSettings } from "@/lib/llm/catalog";

/** Thin fetch helpers for the UI. Server types are imported as types only. */
export async function getJSON<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  return res.json() as Promise<T>;
}

export async function sendJSON<T>(url: string, method: "POST" | "PATCH" | "DELETE", body?: unknown): Promise<T> {
  const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? `${url}: ${res.status}`);
  return res.json() as Promise<T>;
}

export type StreamEvent = AgentEvent | { type: "error"; text: string };

export interface OutgoingMessage {
  text: string;
  attachmentIds?: string[];
  models?: ModelSettings;
  /** Shown next to the message in shared chats. */
  author?: string;
  /** Asset types picked with the chips on the start screen. */
  assetTypes?: string[];
}

/** A per-tab id for presence: two tabs (or two people) on one campaign count as two viewers. */
export function tabId(): string {
  let id = sessionStorage.getItem("lloyd-tab");
  if (!id) sessionStorage.setItem("lloyd-tab", (id = Math.random().toString(36).slice(2, 10)));
  return id;
}

/** POSTs a chat message and calls `onEvent` for every server-sent event until the stream ends. */
export async function streamMessage(campaignId: string, msg: OutgoingMessage, onEvent: (e: StreamEvent) => void): Promise<void> {
  const res = await fetch(`/api/campaigns/${campaignId}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...msg, tab: tabId() }),
  });
  if (!res.ok || !res.body) {
    onEvent({ type: "error", text: (await res.json().catch(() => null))?.error ?? `Request failed (${res.status})` });
    return;
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split("\n\n");
    buffer = parts.pop() ?? "";
    for (const part of parts) {
      const line = part.split("\n").find((l) => l.startsWith("data: "));
      if (line) onEvent(JSON.parse(line.slice(6)) as StreamEvent);
    }
  }
}

export const stopCampaign = (id: string) => sendJSON<{ stopped: boolean }>(`/api/campaigns/${id}/stop`, "POST");

export interface UploadResult {
  ok: boolean;
  id?: string;
  name: string;
  size?: number;
  chars?: number;
  truncated?: boolean;
  error?: string;
}

export async function uploadFiles(files: File[]): Promise<UploadResult[]> {
  const form = new FormData();
  files.forEach((f) => form.append("files", f));
  const res = await fetch("/api/uploads", { method: "POST", body: form });
  if (!res.ok) return files.map((f) => ({ ok: false, name: f.name, error: `Upload failed (${res.status})` }));
  return res.json() as Promise<UploadResult[]>;
}

export const usd = (n: number) => (n < 0.01 ? `$${n.toFixed(4)}` : `$${n.toFixed(3)}`);
export const usdShort = (n: number) => (n < 0.1 ? `$${n.toFixed(2)}` : `$${n.toFixed(2)}`);

export function formatBytes(n: number) {
  return n < 1024 ? `${n} B` : n < 1024 * 1024 ? `${Math.round(n / 1024)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`;
}
