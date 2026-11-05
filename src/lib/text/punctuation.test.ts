import { describe, expect, it } from "vitest";
import { humanizeContent, humanizePunctuation } from "./punctuation";

describe("humanizePunctuation", () => {
  it("turns em dashes into commas", () => {
    expect(humanizePunctuation("a clear destination—not vague promises")).toBe("a clear destination, not vague promises");
    expect(humanizePunctuation("Ship it — today.")).toBe("Ship it, today.");
  });
  it("keeps number ranges as hyphens", () => {
    expect(humanizePunctuation("2–3 weeks, 9am—5pm")).toBe("2-3 weeks, 9am-5pm");
  });
  it("drops a dash before punctuation and fixes list markers", () => {
    expect(humanizePunctuation("Wait for it —.")).toBe("Wait for it.");
    expect(humanizePunctuation("— one\n— two")).toBe("- one\n- two");
  });
  it("changes nothing but the dashes", () => {
    expect(humanizePunctuation("Acme Inc., the leader, e.g., this; arr[:, 0]")).toBe("Acme Inc., the leader, e.g., this; arr[:, 0]");
    expect(humanizePunctuation("Acme Inc., the leader—today")).toBe("Acme Inc., the leader, today");
  });
  it("keeps line breaks and word ranges", () => {
    expect(humanizePunctuation("Intro —\n\nNext para")).toBe("Intro\n\nNext para");
    expect(humanizePunctuation("Q3–Q4, 2024–present")).toBe("Q3-Q4, 2024-present");
    expect(humanizePunctuation("Wait—")).toBe("Wait");
  });
  it("leaves plain hyphens alone", () => {
    expect(humanizePunctuation("on-brand, real-time")).toBe("on-brand, real-time");
  });
});

describe("humanizeContent", () => {
  it("leaves code and pages alone", () => {
    const v = { code: "a — b", html: "<style>p::before{content:'—'}</style>", body: "x — y" };
    expect(humanizeContent(v)).toEqual({ ...v, body: "x, y" });
  });
  it("cleans copy but not links or ids", () => {
    const out = humanizeContent({ posts: [{ text: "One—two" }], cta: { label: "Go — now", url: "https://x.dev/a—b" }, image_id: "img—1" });
    expect(out).toEqual({ posts: [{ text: "One, two" }], cta: { label: "Go, now", url: "https://x.dev/a—b" }, image_id: "img—1" });
  });
});
