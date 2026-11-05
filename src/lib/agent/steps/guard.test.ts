import { describe, expect, it } from "vitest";
import { leakedTargetNumbers, targetNumbers } from "./guard";

describe("targetNumbers", () => {
  it("keeps the target's numbers and drops its dates", () => {
    expect(targetNumbers("60 demo requests by March 31, 2027 from teams in production.")).toEqual(["60"]);
    expect(targetNumbers("250 registrations, 40% attendance by 2026-12-10")).toEqual(["250", "40"]);
    expect(targetNumbers("1,200 signups in Q1 2027; 15 meetings by 10 December")).toEqual(["1,200", "15"]);
  });
});

describe("leakedTargetNumbers", () => {
  const target = "30 customers moving at least one cluster to contain mode by June 30, 2027";
  it("flags the number when it counts the same thing", () => {
    expect(leakedTargetNumbers("Join the 30 customers already in contain mode.", target)).toEqual(["30"]);
    expect(leakedTargetNumbers("We want 60 qualified demo requests.", "60 demo requests by March 31, 2027")).toEqual(["60"]);
    expect(leakedTargetNumbers("Aim for 40% attendance.", "250 registrations, 40% attendance")).toEqual(["40"]);
  });
  it("ignores the same digits used for something else", () => {
    expect(leakedTargetNumbers("The investigation window is 30 minutes by default.", target)).toEqual([]);
    expect(leakedTargetNumbers("1,300 nodes in 2030, a 3.30 release", target)).toEqual([]);
    expect(leakedTargetNumbers("over 11,200 signups", "1,200 signups in Q1 2027")).toEqual([]);
  });
});
