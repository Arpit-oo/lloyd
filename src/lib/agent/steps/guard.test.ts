import { describe, expect, it } from "vitest";
import { evidenceQueries, leakedTargetNumbers, roundRobin, targetNumbers } from "./guard";

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
    expect(leakedTargetNumbers("Start a 30-day trial for customers.", target)).toEqual([]);
    expect(leakedTargetNumbers("Setup takes 30 minutes. Customers love it.", target)).toEqual([]);
  });
});

describe("evidenceQueries", () => {
  it("joins short lines to the next paragraph instead of dropping them", () => {
    const q = evidenceQueries("Subject: Contain mode\n\nNow certified\n\nThe agent isolates a compromised pod in seconds, without a restart.");
    expect(q).toEqual(["Subject: Contain mode\nNow certified", "The agent isolates a compromised pod in seconds, without a restart."]);
    expect(evidenceQueries("Book a demo\n\nThe agent isolates a compromised pod in seconds.")).toEqual(["Book a demo\nThe agent isolates a compromised pod in seconds."]);
    expect(evidenceQueries("A long enough first paragraph to stand alone.\n\nBook a demo")).toEqual(["A long enough first paragraph to stand alone.\nBook a demo"]);
  });
  it("folds a long asset into at most 24 queries and keeps every paragraph", () => {
    const paras = Array.from({ length: 50 }, (_, i) => `Paragraph number ${i} with enough words to count.`);
    const q = evidenceQueries(paras.join("\n\n"));
    expect(q.length).toBeLessThanOrEqual(24);
    expect(q.join("\n")).toContain("Paragraph number 49");
  });
});

describe("roundRobin", () => {
  it("takes each list's best hit before anyone's second", () => {
    const lists = [["a1", "a2", "a3"], ["b1", "b2"], ["c1", "a1"]];
    expect(roundRobin(lists, (x) => x, 4)).toEqual(["a1", "b1", "c1", "a2"]);
  });
});
