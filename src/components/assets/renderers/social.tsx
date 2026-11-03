"use client";

import { Globe, MessageCircle, Repeat2, Send, ThumbsUp, Heart, BarChart2, Bookmark } from "lucide-react";
import { useState } from "react";
import type { z } from "zod";
import type { LinkedInSchema, XSchema } from "@/lib/agent/asset-types";
import { imageUrl, type BrandVars } from "../brand-theme";

/** LinkedIn folds long posts after roughly three lines on desktop. */
const LINKEDIN_FOLD = 210;

function Avatar({ vars, size, round }: { vars: BrandVars; size: number; round?: boolean }) {
  const src = imageUrl(vars.mark ?? vars.logo);
  return (
    <div
      className={`flex shrink-0 items-center justify-center overflow-hidden border border-black/10 bg-white ${round ? "rounded-full" : "rounded-md"}`}
      style={{ width: size, height: size }}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" className="h-full w-full object-contain p-1.5" />
      ) : (
        <span className="font-bold" style={{ color: vars.primary }}>{vars.name[0]}</span>
      )}
    </div>
  );
}

export function LinkedInPost({ data, vars }: { data: z.infer<typeof LinkedInSchema>; vars: BrandVars }) {
  const [open, setOpen] = useState(false);
  const long = data.text.length > LINKEDIN_FOLD;
  const shown = open || !long ? data.text : `${data.text.slice(0, LINKEDIN_FOLD).trimEnd()}…`;
  const img = imageUrl(data.image.image_id);
  return (
    <article className="mx-auto w-full max-w-[555px] rounded-lg border border-black/10 bg-white text-[14px] text-[#191919] shadow-sm" style={{ fontFamily: "-apple-system, system-ui, 'Segoe UI', Roboto, sans-serif" }}>
      <header className="flex gap-2 px-4 pt-3">
        <Avatar vars={vars} size={48} round={data.author_kind === "person"} />
        <div className="min-w-0 leading-tight">
          <div className="font-semibold">{data.author}</div>
          <div className="text-xs text-black/60">{data.author_kind === "company" ? "Company page" : "Personal profile"}</div>
          <div className="flex items-center gap-1 text-xs text-black/60">
            1h • <Globe size={12} />
          </div>
        </div>
      </header>
      <div className="whitespace-pre-wrap px-4 py-3 leading-[1.45]">
        {shown}
        {long && !open && (
          <button onClick={() => setOpen(true)} className="ml-1 text-black/60 hover:text-[#0a66c2] hover:underline">
            …see more
          </button>
        )}
        {data.hashtags.length > 0 && (
          <div className="mt-2 font-semibold text-[#0a66c2]">{data.hashtags.map((h) => `#${h.replace(/^#/, "")}`).join(" ")}</div>
        )}
      </div>
      {img && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={img} alt={data.image.alt ?? ""} className="aspect-[1.91/1] w-full object-cover" />
      )}
      {data.link && !img && (
        <div className="mx-4 mb-3 truncate rounded border border-black/10 bg-black/[0.03] px-3 py-2 text-xs text-black/60">{data.link}</div>
      )}
      <footer className="grid border-t border-black/10 grid-cols-4 px-2 py-1 text-[13px] font-semibold text-black/60">
        {[
          [ThumbsUp, "Like"],
          [MessageCircle, "Comment"],
          [Repeat2, "Repost"],
          [Send, "Send"],
        ].map(([Icon, label]) => {
          const I = Icon as typeof ThumbsUp;
          return (
            <span key={label as string} className="flex items-center justify-center gap-1.5 rounded py-2.5">
              <I size={18} /> {label as string}
            </span>
          );
        })}
      </footer>
    </article>
  );
}

export function XPost({ data, vars }: { data: z.infer<typeof XSchema>; vars: BrandVars }) {
  const img = imageUrl(data.image.image_id);
  return (
    <div className="mx-auto w-full max-w-[598px] rounded-2xl border border-black/10 bg-white text-[15px] text-[#0f1419]" style={{ fontFamily: "-apple-system, system-ui, 'Segoe UI', Roboto, sans-serif" }}>
      {data.posts.map((p, i) => (
        <article key={i} className="flex gap-3 px-4 pt-3">
          <div className="flex flex-col items-center">
            <Avatar vars={vars} size={40} round />
            {i < data.posts.length - 1 && <div className="mt-1 w-0.5 flex-1 bg-black/15" />}
          </div>
          <div className="min-w-0 flex-1 pb-3">
            <div className="flex items-center gap-1 text-[15px]">
              <span className="font-bold">{data.display_name}</span>
              <span className="text-black/50">{data.handle} · 2h</span>
            </div>
            <div className="mt-0.5 whitespace-pre-wrap leading-snug">{p.text}</div>
            {i === 0 && img && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={img} alt={data.image.alt ?? ""} className="mt-3 aspect-video w-full rounded-2xl border border-black/10 object-cover" />
            )}
            <div className="mt-3 flex max-w-[425px] justify-between text-[13px] text-black/50">
              <span className="flex items-center gap-1"><MessageCircle size={16} /></span>
              <span className="flex items-center gap-1"><Repeat2 size={16} /></span>
              <span className="flex items-center gap-1"><Heart size={16} /></span>
              <span className="flex items-center gap-1"><BarChart2 size={16} /></span>
              <Bookmark size={16} />
            </div>
            <div className={`mt-2 text-right text-[11px] ${p.text.length > 280 ? "font-semibold text-rose-600" : "text-black/40"}`}>{p.text.length}/280</div>
          </div>
        </article>
      ))}
    </div>
  );
}
