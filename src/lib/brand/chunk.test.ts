import { describe, expect, it } from "vitest";
import { chunkMarkdown } from "./chunk";

describe("chunkMarkdown", () => {
  it("keeps heading breadcrumbs", () => {
    const md = "# Claims\n\nIntro text that is long enough to stand alone as its own chunk of content here.\n\n## 4. Certification\n\nNever claim FedRAMP authorization. The only wording allowed is the approved sentence, exactly as written.";
    const chunks = chunkMarkdown(md, "approved-claims.md");
    expect(chunks.at(-1)?.headingPath).toBe("approved-claims.md > Claims > 4. Certification");
    expect(chunks.at(-1)?.text).toContain("Never claim FedRAMP");
  });

  it("ignores # inside code fences", () => {
    const md = "## Policy\n\n```yaml\n# not a heading\ndefaultAction: deny\n```\n\nMore text after the code block so this section is not tiny at all.";
    const chunks = chunkMarkdown(md, "doc");
    expect(chunks).toHaveLength(1);
    expect(chunks[0].text).toContain("# not a heading");
  });

  it("splits oversized sections on paragraph boundaries", () => {
    const para = "word ".repeat(400);
    const md = `## Big\n\n${para}\n\n${para}\n\n${para}`;
    const chunks = chunkMarkdown(md, "doc");
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[1].text).toMatch(/continued/);
  });
});
