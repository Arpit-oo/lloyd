"use client";

import { Archive, Reply, Star, Trash2 } from "lucide-react";
import type { z } from "zod";
import type { EmailSchema } from "@/lib/agent/asset-types";
import { imageUrl, type BrandVars } from "../brand-theme";

/** Renders an email the way it looks in a mail client: inbox row, header, then a 600px body. */
export function EmailView({ data, vars }: { data: z.infer<typeof EmailSchema>; vars: BrandVars }) {
  const header = imageUrl(data.header_image.image_id);
  const logo = imageUrl(vars.logo);
  return (
    <div className="mx-auto w-full max-w-[760px] overflow-hidden rounded-xl border border-black/10 bg-white shadow-sm" style={{ fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif" }}>
      {/* inbox row */}
      <div className="flex items-center gap-3 border-b border-black/10 bg-[#f6f8fc] px-4 py-2.5 text-[13px]">
        <Star size={15} className="text-black/30" />
        <span className="w-40 shrink-0 truncate font-semibold text-black">{data.from_name}</span>
        <span className="min-w-0 truncate">
          <span className="font-semibold text-black">{data.subject}</span>
          <span className="text-black/50"> — {data.preheader}</span>
        </span>
        <span className="ml-auto shrink-0 text-xs font-semibold text-black/60">9:02 AM</span>
      </div>
      {/* opened message header */}
      <div className="px-6 pt-5">
        <div className="flex items-start justify-between gap-4">
          <h2 className="text-[22px] font-normal leading-tight text-black">{data.subject}</h2>
          <div className="flex gap-3 text-black/40">
            <Archive size={18} />
            <Trash2 size={18} />
            <Reply size={18} />
          </div>
        </div>
        <div className="mt-3 flex items-center gap-3 text-[13px]">
          <div className="flex h-9 w-9 items-center justify-center rounded-full text-sm font-semibold text-white" style={{ background: vars.primary }}>
            {data.from_name[0]}
          </div>
          <div>
            <div>
              <span className="font-semibold text-black">{data.from_name}</span> <span className="text-black/50">&lt;{data.from_address}&gt;</span>
            </div>
            <div className="text-black/50">to {data.to_segment}</div>
          </div>
        </div>
      </div>
      {/* body */}
      <div className="px-6 py-6" style={{ background: "#f4f4f2" }}>
        <div className="mx-auto max-w-[600px] overflow-hidden rounded-md bg-white" style={{ fontFamily: "var(--brand-body)", color: vars.ink }}>
          {logo && (
            <div className="px-8 pt-6">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={logo} alt={vars.name} className="h-7 w-auto" />
            </div>
          )}
          {header && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={header} alt={data.header_image.alt ?? ""} className="mt-5 aspect-[2/1] w-full object-cover" />
          )}
          <div className="space-y-4 px-8 py-7 text-[15px] leading-[1.6]">
            {data.blocks.map((b, i) => {
              if (b.kind === "heading") return <h3 key={i} className="text-xl font-bold leading-snug" style={{ fontFamily: "var(--brand-display)" }}>{b.text}</h3>;
              if (b.kind === "bullets") return <ul key={i} className="list-disc space-y-1 pl-5">{b.items.map((it, j) => <li key={j}>{it}</li>)}</ul>;
              if (b.kind === "code") return <pre key={i} className="overflow-x-auto rounded-md p-4 text-[13px] text-white" style={{ background: vars.ink, fontFamily: "var(--brand-mono)" }}>{b.text}</pre>;
              if (b.kind === "quote") return <blockquote key={i} className="border-l-4 pl-4 italic" style={{ borderColor: vars.primary }}>{b.text}</blockquote>;
              if (b.kind === "button")
                return (
                  <div key={i} className="pt-1">
                    <span className="inline-block rounded-md px-5 py-3 text-[15px] font-semibold text-white" style={{ background: vars.primary }} title={b.url ?? ""}>
                      {b.text}
                    </span>
                  </div>
                );
              return <p key={i} className="whitespace-pre-wrap">{b.text}</p>;
            })}
            <p className="whitespace-pre-wrap pt-2">{data.signature}</p>
          </div>
          <div className="border-t border-black/10 px-8 py-5 text-xs leading-relaxed text-black/50">{data.footer}</div>
        </div>
      </div>
    </div>
  );
}
