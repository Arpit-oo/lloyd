"use client";

import { ChevronDown, Lock } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { z } from "zod";
import type { BlogSchema, LandingSchema } from "@/lib/agent/asset-types";
import { imageUrl, luminance, onColor, radius, type BrandVars } from "../brand-theme";

/** Browser window chrome so web assets read as pages, not cards. */
function BrowserFrame({ url, children }: { url: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-[1100px] overflow-hidden rounded-xl border border-black/15 bg-white shadow-sm">
      <div className="flex items-center gap-3 border-b border-black/10 bg-[#efeeec] px-4 py-2.5">
        <div className="flex gap-1.5">
          <span className="h-3 w-3 rounded-full bg-[#ff5f57]" />
          <span className="h-3 w-3 rounded-full bg-[#febc2e]" />
          <span className="h-3 w-3 rounded-full bg-[#28c840]" />
        </div>
        <div className="flex min-w-0 flex-1 items-center gap-2 rounded-md bg-white px-3 py-1 text-xs text-black/60">
          <Lock size={12} /> <span className="truncate">{url}</span>
        </div>
      </div>
      {children}
    </div>
  );
}

function SiteNav({ vars, cta, dark = false }: { vars: BrandVars; cta?: string; dark?: boolean }) {
  // On a dark page use the brand's reversed logo; without one, render the logo white.
  const logo = imageUrl(dark && vars.logoDark ? vars.logoDark : vars.logo);
  const invert = dark && !vars.logoDark;
  return (
    <nav className="flex items-center justify-between px-10 py-5">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {logo ? <img src={logo} alt={vars.name} className="h-7 w-auto" style={invert ? { filter: "brightness(0) invert(1)" } : undefined} /> : <span className="text-lg font-bold">{vars.name}</span>}
      <div className="flex items-center gap-7 text-sm opacity-80">
        <span>Product</span>
        <span>Customers</span>
        <span>Docs</span>
        <span>Pricing</span>
        {cta && <span className="px-4 py-2 font-semibold opacity-100" style={{ background: vars.primary, color: onColor(vars.primary), borderRadius: radius(vars.corners).button }}>{cta}</span>}
      </div>
    </nav>
  );
}

const md = (text: string) => (
  <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
);

export function BlogView({ data, vars }: { data: z.infer<typeof BlogSchema>; vars: BrandVars }) {
  const hero = imageUrl(data.hero_image.image_id);
  const words = data.sections.reduce((n, s) => n + s.body_markdown.split(/\s+/).length, 0);
  const slug = data.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return (
    <BrowserFrame url={`${vars.name.toLowerCase()}.example/blog/${slug}`}>
      <div style={{ background: vars.ground, color: vars.ink }}>
        <SiteNav vars={vars} dark={luminance(vars.ground) < 0.2} />
        <article className="mx-auto max-w-[720px] px-6 pb-20 pt-8">
          <div className="text-sm font-semibold uppercase tracking-wider" style={{ color: vars.primary }}>Blog</div>
          <h1 className="mt-3 text-[44px] font-bold leading-[1.08]" style={{ fontFamily: "var(--brand-display)" }}>{data.title}</h1>
          {data.subtitle && <p className="mt-4 text-xl leading-snug opacity-75">{data.subtitle}</p>}
          <div className="mt-6 flex items-center gap-3 text-sm opacity-70">
            <span className="font-semibold">{data.author}</span>
            <span>·</span>
            <span>{data.publish_date ?? "Draft"}</span>
            <span>·</span>
            <span>{Math.max(1, Math.round(words / 230))} min read</span>
          </div>
        </article>
        {hero && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={hero} alt={data.hero_image.alt ?? ""} className="mx-auto -mt-12 mb-12 aspect-[2/1] w-full max-w-[960px] object-cover" />
        )}
        <div className="prose-brand mx-auto max-w-[720px] px-6 pb-20 text-[17px]">
          {data.sections.map((s, i) => (
            <section key={i}>
              {s.heading && <h2>{s.heading}</h2>}
              {md(s.body_markdown)}
            </section>
          ))}
          {data.sources.length > 0 && (
            <div className="mt-12 border-t border-black/10 pt-6 text-sm opacity-80">
              <div className="mb-2 font-semibold">Sources</div>
              <ol className="list-decimal pl-5">
                {data.sources.map((s, i) => (
                  <li key={i}>
                    <a href={s.url} target="_blank" rel="noreferrer">{s.label}</a>
                    {s.date ? `, ${s.date}` : ""}
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>
      </div>
    </BrowserFrame>
  );
}

/** Section padding for each density. */
const PAD: Record<BrandVars["density"], string> = { compact: "px-8 py-10", normal: "px-10 py-16", roomy: "px-12 py-24" };

export function LandingView({ data, vars }: { data: z.infer<typeof LandingSchema>; vars: BrandVars }) {
  const hero = imageUrl(data.hero.image.image_id);
  // Dark tone: the darker of ground and ink becomes the background (no flip if ground is already dark).
  const groundIsDark = luminance(vars.ground) < 0.2;
  const dark = vars.tone === "dark" || groundIsDark;
  const page = vars.tone === "dark" && !groundIsDark ? { background: vars.ink, color: vars.ground } : { background: vars.ground, color: vars.ink };
  const r = radius(vars.corners);
  const layout = hero ? vars.heroLayout : vars.heroLayout === "split" ? "split" : "centered";
  const centered = layout === "centered";
  const onImage = layout === "image_background" && !!hero;

  const copy = (
    <div className={centered || onImage ? "mx-auto max-w-[46rem] text-center" : ""}>
      {data.hero.eyebrow && <div className="mb-4 text-sm font-semibold uppercase tracking-wider" style={{ color: onImage ? "#fff" : vars.primary }}>{data.hero.eyebrow}</div>}
      <h1
        className={`font-bold leading-[1.04] ${hero && layout === "split" ? "text-[clamp(2rem,4vw,2.75rem)]" : `${centered || onImage ? "mx-auto" : ""} max-w-[18ch] text-[clamp(2.25rem,6vw,3.5rem)]`}`}
        style={{ fontFamily: "var(--brand-display)" }}
      >
        {data.hero.headline}
      </h1>
      <p className={`mt-5 max-w-[34rem] text-lg leading-relaxed opacity-80 ${centered || onImage ? "mx-auto" : ""}`}>{data.hero.subhead}</p>
      <div className={`mt-8 flex flex-wrap items-center gap-5 ${centered || onImage ? "justify-center" : ""}`}>
        <span className="px-6 py-3.5 font-semibold" style={{ background: vars.primary, color: onColor(vars.primary), borderRadius: r.button }}>{data.hero.primary_cta}</span>
        {data.hero.secondary_cta && <span className="font-semibold underline underline-offset-4">{data.hero.secondary_cta} →</span>}
      </div>
    </div>
  );

  return (
    <BrowserFrame url={`${vars.name.toLowerCase()}.example${data.url_path ?? "/"}`}>
      <div style={page}>
        <SiteNav vars={vars} cta={data.hero.primary_cta} dark={dark} />
        {onImage ? (
          <section className="relative overflow-hidden" style={{ minHeight: vars.density === "roomy" ? 560 : vars.density === "compact" ? 380 : 470 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={hero!} alt={data.hero.image.alt ?? ""} className="absolute inset-0 h-full w-full object-cover" />
            <div className="absolute inset-0 bg-black/55" />
            <div className={`relative text-white ${PAD[vars.density]}`}>{copy}</div>
          </section>
        ) : centered ? (
          <section className={`${PAD[vars.density]} !pt-10`}>
            {copy}
            {hero && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={hero} alt={data.hero.image.alt ?? ""} className="mx-auto mt-12 aspect-[16/8] w-full max-w-[960px] object-cover" style={{ borderRadius: r.card }} />
            )}
          </section>
        ) : (
          <section className={`grid items-center gap-10 ${PAD[vars.density]} !pt-10 ${hero ? "md:grid-cols-[1.1fr_1fr]" : ""}`}>
            {copy}
            {hero && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={hero} alt={data.hero.image.alt ?? ""} className="aspect-[4/3] w-full object-cover" style={{ borderRadius: r.card }} />
            )}
          </section>
        )}
        {data.sections.map((s, i) => (
          <LandingSection key={i} section={s} vars={vars} alt={vars.tone === "alternate" && i % 2 === 0} dark={dark} />
        ))}
        {data.footer_note && <footer className="px-10 py-8 text-xs opacity-60">{data.footer_note}</footer>}
      </div>
    </BrowserFrame>
  );
}

function LandingSection({ section: s, vars, alt, dark }: { section: z.infer<typeof LandingSchema>["sections"][number]; vars: BrandVars; alt: boolean; dark: boolean }) {
  const r = radius(vars.corners);
  const pad = PAD[vars.density];
  const panel = dark ? "rgba(255,255,255,0.06)" : "#fff";
  const rule = dark ? "border-white/15" : "border-black/10";
  const heading = <h2 className="text-[32px] font-bold leading-tight" style={{ fontFamily: "var(--brand-display)" }}>{s.heading}</h2>;
  const intro = s.intro && <p className="mt-3 max-w-[44rem] text-[17px] leading-relaxed opacity-80">{s.intro}</p>;
  const button = <span className="mt-8 inline-block px-6 py-3.5 font-semibold" style={{ background: vars.primary, color: onColor(vars.primary), borderRadius: r.button }}>{s.items[0]?.title ?? "Book a demo"}</span>;

  if (s.kind === "cta")
    return vars.ctaStyle === "card" ? (
      <section className={pad}>
        <div className="px-10 py-14 text-center" style={{ background: vars.primary, color: onColor(vars.primary), borderRadius: r.card }}>
          {heading}
          {intro}
          <span className="mt-8 inline-block px-6 py-3.5 font-semibold" style={{ background: onColor(vars.primary), color: vars.primary, borderRadius: r.button }}>{s.items[0]?.title ?? "Book a demo"}</span>
        </div>
      </section>
    ) : (
      <section className={`${pad} text-center`} style={dark ? { background: "rgba(255,255,255,0.06)" } : { background: vars.ink, color: vars.ground }}>
        {heading}
        {intro}
        {button}
      </section>
    );

  return (
    <section className={pad} style={{ background: alt ? "rgba(0,0,0,0.03)" : "transparent" }}>
      {heading}
      {intro}
      {s.kind === "code" && s.code && (
        <pre className="mt-6 overflow-x-auto p-5 text-[13px] leading-relaxed text-[#f4efe6]" style={{ background: dark ? "rgba(0,0,0,0.35)" : vars.ink, fontFamily: "var(--brand-mono)", borderRadius: r.card }}>{s.code}</pre>
      )}
      {s.kind === "faq" ? (
        <div className={`mt-6 divide-y border-y ${rule} ${dark ? "divide-white/15" : "divide-black/10"}`}>
          {s.items.map((it, j) => (
            <details key={j} className="group py-4" open={j === 0}>
              <summary className="flex cursor-pointer list-none items-center justify-between font-semibold">
                {it.title}
                <ChevronDown size={18} className="transition group-open:rotate-180" />
              </summary>
              <p className="mt-2 leading-relaxed opacity-80">{it.body}</p>
            </details>
          ))}
        </div>
      ) : s.kind === "steps" ? (
        <ol className="mt-8 grid gap-6 md:grid-cols-3">
          {s.items.map((it, j) => (
            <li key={j}>
              <div className="mb-3 flex h-9 w-9 items-center justify-center font-bold" style={{ background: vars.primary, color: onColor(vars.primary), borderRadius: vars.corners === "sharp" ? 0 : 999 }}>{j + 1}</div>
              <div className="font-semibold">{it.title}</div>
              <p className="mt-1 leading-relaxed opacity-80">{it.body}</p>
            </li>
          ))}
        </ol>
      ) : s.kind === "limits" ? (
        <ul className={`mt-6 space-y-3 p-6 ring-1 ${dark ? "ring-white/15" : "ring-black/10"}`} style={{ background: dark ? panel : "rgba(255,255,255,0.6)", borderRadius: r.card }}>
          {s.items.map((it, j) => (
            <li key={j}>
              <span className="font-semibold">{it.title}.</span> <span className="opacity-80">{it.body}</span>
            </li>
          ))}
        </ul>
      ) : s.kind === "proof" ? (
        <div className="mt-6 grid gap-6 md:grid-cols-2">
          {s.items.map((it, j) => (
            <figure key={j} className="p-6 shadow-sm" style={{ background: panel, borderRadius: r.card }}>
              <div className="text-sm font-semibold uppercase tracking-wide" style={{ color: vars.primary }}>{it.title}</div>
              <p className="mt-2 text-lg leading-snug">{it.body}</p>
            </figure>
          ))}
        </div>
      ) : (
        s.items.length > 0 && (
          <div className="mt-8 grid gap-8 md:grid-cols-3">
            {s.items.map((it, j) => (
              <div key={j}>
                <div className="mb-3 h-1 w-10" style={{ background: vars.primary, borderRadius: vars.corners === "sharp" ? 0 : 4 }} />
                <div className="text-lg font-semibold">{it.title}</div>
                <p className="mt-1.5 leading-relaxed opacity-80">{it.body}</p>
              </div>
            ))}
          </div>
        )
      )}
    </section>
  );
}
