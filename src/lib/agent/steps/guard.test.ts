import { describe, expect, it } from "vitest";
import { targetNumbers } from "./guard";

describe("targetNumbers", () => {
  it("keeps the target's numbers and drops its dates", () => {
    expect(targetNumbers("60 demo requests by March 31, 2027 from teams in production.")).toEqual(["60"]);
    expect(targetNumbers("250 registrations, 40% attendance by 2026-12-10")).toEqual(["250", "40"]);
    expect(targetNumbers("1,200 signups in Q1 2027; 15 meetings by 10 December")).toEqual(["1,200", "15"]);
  });
});
