import { describe, expect, it } from "vitest";
import { compactResolutions, type StoredConflict } from "./conflicts";

const res = (winners: string[], losers: string[], confidence: "high" | "medium" | "low" = "high"): StoredConflict => ({
  factIds: [...winners, ...losers],
  resolution: {
    group: 0, is_conflict: true, topic: "t", winner_fact_ids: winners, loser_fact_ids: losers,
    rule_applied: "r", explanation: `e-${confidence}`, confidence, needs_user: false, owner_note: null,
  },
});

describe("compactResolutions", () => {
  it("merges resolutions with the same winners and keeps every loser", () => {
    const out = compactResolutions([res(["legal#1"], ["a#1"]), res(["legal#1"], ["b#2"], "medium"), res(["legal#9"], ["c#3"])]);
    expect(out).toHaveLength(2);
    const merged = out.find((o) => o.resolution.winner_fact_ids[0] === "legal#1")!;
    expect(merged.resolution.loser_fact_ids.sort()).toEqual(["a#1", "b#2"]);
    expect(merged.resolution.explanation).toBe("e-high");
    expect(merged.factIds.sort()).toEqual(["a#1", "b#2", "legal#1"]);
  });

  it("keys on the most authoritative winners only", () => {
    const tier = (id: string) => (id.startsWith("legal") ? 1 : 4);
    const out = compactResolutions([res(["legal#22", "notes#3"], ["a#1"]), res(["legal#22", "notes#9"], ["b#2"])], tier);
    expect(out).toHaveLength(1);
  });

  it("is idempotent", () => {
    const once = compactResolutions([res(["x"], ["a"]), res(["x"], ["b"])]);
    expect(compactResolutions(once)).toEqual(once);
  });
});
