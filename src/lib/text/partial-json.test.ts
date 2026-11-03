import { describe, expect, it } from "vitest";
import { draftText } from "./partial-json";

describe("draftText", () => {
  it("keeps copy fields in order, including an unfinished one", () => {
    const raw = '{"from_name":"Wickhold","from_address":"hi@x.example","subject":"Contain first","blocks":[{"kind":"paragraph","text":"Most teams can see a pro';
    expect(draftText(raw)).toBe("Wickhold\n\nContain first\n\nMost teams can see a pro");
  });

  it("skips ids and urls and unescapes text", () => {
    const raw = '{"hero":{"headline":"Say \\"no\\" fast","image":{"image_id":"hero-1","alt":"x"}},"sections":[{"url":"https://a"}';
    expect(draftText(raw)).toBe('Say "no" fast');
  });

  it("handles an empty or key-only stream", () => {
    expect(draftText("")).toBe("");
    expect(draftText('{"subject":')).toBe("");
  });
});
