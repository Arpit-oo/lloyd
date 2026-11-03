import { z } from "zod";
import { CORNERS, CTA_STYLES, DENSITIES, HERO_LAYOUTS, SECTION_TONES } from "./design";

/** A design change, as the model returns it (edits, design references). null = unchanged. */
const Hex = z.string().nullable().describe("A #rrggbb colour, or null to leave it unchanged.");

export const StyleRequestSchema = z.object({
  primary: Hex.describe("Main colour: buttons, links, highlights, eyebrows. #rrggbb or null."),
  accent: Hex.describe("Secondary highlight colour. #rrggbb or null."),
  background: Hex.describe("Page background. #rrggbb or null."),
  text: Hex.describe("Body text colour. #rrggbb or null."),
  font_display: z.string().nullable().describe("Headline font, exactly one of the allowed fonts, or null."),
  font_body: z.string().nullable().describe("Body font, exactly one of the allowed fonts, or null."),
  density: z.enum(DENSITIES).nullable().describe("Spacing: compact, normal or roomy. null = unchanged."),
  corners: z.enum(CORNERS).nullable().describe("Button and card corners: sharp, rounded or pill. null = unchanged."),
  section_tone: z.enum(SECTION_TONES).nullable().describe("Section backgrounds: light (all plain), alternate (tinted every other), dark (dark page). null = unchanged."),
  hero_layout: z.enum(HERO_LAYOUTS).nullable().describe("Landing page hero: split (text left, image right), centered (text centered, image below), image_background (image behind the text). null = unchanged."),
  cta_style: z.enum(CTA_STYLES).nullable().describe("Closing call to action: band (full-width dark band) or card (a rounded panel). null = unchanged."),
  reset_to_brand: z.boolean().describe("True only if asked to go back to the brand's own design."),
});
