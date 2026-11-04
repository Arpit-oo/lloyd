import { describe, expect, it } from "vitest";
import { extractBuffer, htmlToMarkdownish } from "./loaders";

describe("htmlToMarkdownish", () => {
  it("keeps headings and list items so chunking can follow them", () => {
    const md = htmlToMarkdownish("<h1>Claims</h1><p>Never say &quot;certified&quot;.</p><h2>Customers</h2><ul><li>Northvale</li><li>Harlow &amp; Co</li></ul>");
    expect(md).toContain("# Claims");
    expect(md).toContain('Never say "certified".');
    expect(md).toContain("## Customers");
    expect(md).toContain("- Harlow & Co");
  });
});

describe("pptx", () => {
  it("reads slide text in order, with speaker notes", async () => {
    const JSZip = (await import("jszip")).default;
    const zip = new JSZip();
    const slide = (lines: string[]) => `<p:sld><p:txBody>${lines.map((l) => `<a:p><a:r><a:t>${l}</a:t></a:r></a:p>`).join("")}</p:txBody></p:sld>`;
    zip.file("ppt/slides/slide2.xml", slide(["Goals", "60 demos &amp; more"]));
    zip.file("ppt/slides/slide1.xml", slide(["Campaign brief", "Launch on Jan 26"]));
    zip.file("ppt/notesSlides/notesSlide1.xml", slide(["Keep it plain", "1"]));
    const text = await extractBuffer("brief.pptx", await zip.generateAsync({ type: "nodebuffer" }));
    expect(text).toBe("# brief\n\n## Slide 1: Campaign brief\n\nLaunch on Jan 26\n\nSpeaker notes: Keep it plain\n\n## Slide 2: Goals\n\n60 demos & more");
  });
});
