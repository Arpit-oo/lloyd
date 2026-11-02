import { z } from "zod";

/**
 * The four allowed asset families, five concrete formats. Each schema mirrors how the asset looks
 * in the real world so the renderer can draw it faithfully, and splits it into named parts so an
 * edit like "fix the subject line" or "shorten section 2" touches only that part.
 */
export const ASSET_TYPES = ["linkedin_post", "x_post", "email", "blog_post", "landing_page"] as const;
export type AssetType = (typeof ASSET_TYPES)[number];

export const ASSET_LABEL: Record<AssetType, string> = {
  linkedin_post: "LinkedIn post",
  x_post: "X post",
  email: "Email",
  blog_post: "Blog post",
  landing_page: "Landing page",
};

const ImageRef = z.object({
  image_id: z.string().nullable().describe("Id of a library image from the candidates given, or null for no image."),
  alt: z.string().nullable().describe("Alt text describing the image for screen readers."),
});

export const LinkedInSchema = z.object({
  author: z.string().describe("Company page name or the person's name."),
  author_kind: z.enum(["company", "person"]),
  text: z.string().describe("The full post text with line breaks as they would appear."),
  hashtags: z.array(z.string()),
  image: ImageRef,
  link: z.string().nullable(),
});

export const XSchema = z.object({
  handle: z.string().describe("Account handle, e.g. @brand. Use the brand's handle if known, else a plausible one from the brand name."),
  display_name: z.string(),
  posts: z.array(z.object({ text: z.string().describe("Max 280 characters.") })).describe("One post, or a short thread."),
  image: ImageRef,
});

export const EmailSchema = z.object({
  from_name: z.string(),
  from_address: z.string(),
  to_segment: z.string().describe("List or segment it goes to."),
  subject: z.string(),
  preheader: z.string(),
  header_image: ImageRef,
  blocks: z.array(
    z.object({
      kind: z.enum(["heading", "paragraph", "bullets", "code", "button", "quote"]),
      text: z.string().describe("Text, or button label, or code."),
      items: z.array(z.string()).describe("Bullet items when kind = bullets, else empty."),
      url: z.string().nullable().describe("Button target when kind = button."),
    }),
  ),
  signature: z.string(),
  footer: z.string().describe("Footer line, e.g. why they got it and how to unsubscribe."),
});

export const BlogSchema = z.object({
  title: z.string(),
  subtitle: z.string().nullable(),
  author: z.string(),
  publish_date: z.string().nullable(),
  hero_image: ImageRef,
  sections: z.array(
    z.object({
      heading: z.string().nullable().describe("Null for the intro."),
      body_markdown: z.string().describe("Markdown: paragraphs, lists, code fences, links."),
    }),
  ),
  meta_description: z.string(),
  sources: z.array(z.object({ label: z.string(), url: z.string(), date: z.string().nullable() })),
});

export const LandingSchema = z.object({
  page_title: z.string(),
  url_path: z.string().nullable(),
  hero: z.object({
    eyebrow: z.string().nullable(),
    headline: z.string(),
    subhead: z.string(),
    primary_cta: z.string(),
    secondary_cta: z.string().nullable(),
    image: ImageRef,
  }),
  sections: z.array(
    z.object({
      kind: z.enum(["features", "steps", "code", "faq", "proof", "limits", "text", "cta"]),
      heading: z.string(),
      intro: z.string().nullable(),
      items: z.array(z.object({ title: z.string(), body: z.string() })),
      code: z.string().nullable(),
    }),
  ),
  footer_note: z.string().nullable(),
});

export const ASSET_SCHEMAS = {
  linkedin_post: LinkedInSchema,
  x_post: XSchema,
  email: EmailSchema,
  blog_post: BlogSchema,
  landing_page: LandingSchema,
} as const;

export type AssetContent =
  | { type: "linkedin_post"; data: z.infer<typeof LinkedInSchema> }
  | { type: "x_post"; data: z.infer<typeof XSchema> }
  | { type: "email"; data: z.infer<typeof EmailSchema> }
  | { type: "blog_post"; data: z.infer<typeof BlogSchema> }
  | { type: "landing_page"; data: z.infer<typeof LandingSchema> };

/** Flattens an asset to plain text, for the claim guard and length checks. */
export function assetToText(a: AssetContent): string {
  switch (a.type) {
    case "linkedin_post":
      return `${a.data.text}\n${a.data.hashtags.map((h) => `#${h.replace(/^#/, "")}`).join(" ")}`;
    case "x_post":
      return a.data.posts.map((p) => p.text).join("\n\n");
    case "email":
      return [`Subject: ${a.data.subject}`, `Preheader: ${a.data.preheader}`, ...a.data.blocks.map((b) => [b.text, ...b.items].join("\n")), a.data.signature, a.data.footer].join("\n\n");
    case "blog_post":
      return [a.data.title, a.data.subtitle ?? "", ...a.data.sections.map((s) => `${s.heading ?? ""}\n${s.body_markdown}`)].join("\n\n");
    case "landing_page":
      return [a.data.hero.eyebrow ?? "", a.data.hero.headline, a.data.hero.subhead, a.data.hero.primary_cta, a.data.hero.secondary_cta ?? "",
        ...a.data.sections.map((s) => [s.heading, s.intro ?? "", ...s.items.map((i) => `${i.title}: ${i.body}`), s.code ?? ""].join("\n")), a.data.footer_note ?? ""].join("\n\n");
  }
}
