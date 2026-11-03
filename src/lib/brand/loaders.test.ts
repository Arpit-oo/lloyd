import { describe, expect, it } from "vitest";
import { htmlToMarkdownish } from "./loaders";

describe("htmlToMarkdownish", () => {
  it("keeps headings and list items so chunking can follow them", () => {
    const md = htmlToMarkdownish("<h1>Claims</h1><p>Never say &quot;certified&quot;.</p><h2>Customers</h2><ul><li>Northvale</li><li>Harlow &amp; Co</li></ul>");
    expect(md).toContain("# Claims");
    expect(md).toContain('Never say "certified".');
    expect(md).toContain("## Customers");
    expect(md).toContain("- Harlow & Co");
  });
});
