import { z } from "zod";
import { llm, type CallContext } from "@/lib/llm/client";

/**
 * Colors, fonts and logo files pulled from the brand's own guidelines, so asset previews
 * render in the brand's look without anything hardcoded in the renderers.
 */
export const DesignTokensSchema = z.object({
  brand_name: z.string(),
  colors: z.array(z.object({ name: z.string(), hex: z.string(), role: z.string().describe("e.g. primary, ink, background, accent, secondary") })),
  fonts: z.array(
    z.object({
      family: z.string().describe("Plain family name as published, without weight words, e.g. 'IBM Plex Sans' not 'IBM Plex Sans Bold'."),
      role: z.enum(["display", "body", "mono", "wordmark", "other"]),
    }),
  ),
  logo_files: z.array(z.object({ filename: z.string(), use: z.string().describe("e.g. on light background, on dark background, mark only") })),
  tagline: z.string().nullable(),
});
export type DesignTokens = z.infer<typeof DesignTokensSchema>;

export async function extractDesignTokens(passages: string, imageFiles: string[], ctx: CallContext): Promise<DesignTokens> {
  const res = await llm.json({
    step: "ingest:design-tokens",
    tier: "fast",
    system: [{ text: "Extract the CURRENT visual identity from the brand passages: every color with hex and role, the typefaces for headlines (display), body text and code (mono), logo files, and the current tagline. Passages are ordered by authority; ignore retired or superseded identity. Only pick logo filenames that exist in the provided list." }],
    input: `Image files:\n${imageFiles.join("\n")}\n\nPassages:\n${passages}`,
    schema: DesignTokensSchema,
    schemaName: "design_tokens",
    ctx,
  });
  return res.data;
}
