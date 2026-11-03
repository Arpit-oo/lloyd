import { describe, expect, it } from "vitest";
import { diffWords } from "./diff";

describe("diffWords", () => {
  it("marks removed and added words and re-joins to both sides", () => {
    const before = "Book a demo today with our team";
    const after = "Book a demo with our platform team";
    const parts = diffWords(before, after);
    expect(parts.filter((p) => p.kind !== "added").map((p) => p.text).join("")).toBe(before);
    expect(parts.filter((p) => p.kind !== "removed").map((p) => p.text).join("")).toBe(after);
    expect(parts.some((p) => p.kind === "removed" && p.text.includes("today"))).toBe(true);
    expect(parts.some((p) => p.kind === "added" && p.text.includes("platform"))).toBe(true);
  });

  it("returns one same part for identical text", () => {
    expect(diffWords("a b c", "a b c")).toEqual([{ kind: "same", text: "a b c" }]);
  });
});
