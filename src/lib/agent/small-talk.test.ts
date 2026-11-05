import { describe, expect, it } from "vitest";
import { isDocQuestion, isSmallTalk, pickFiles } from "./agent";

describe("isSmallTalk", () => {
  it("catches greetings and help on their own", () => {
    for (const t of ["hi", "Hi!", "hey there", "hello Lloyd", "thanks", "what can you do?", "good morning", "test", "Hi, what can you do?", "hey lloyd! how can you help me?", "hello. what is this? where do i start"]) expect(isSmallTalk(t), t).toBe(true);
  });
  it("leaves anything that could be a brief alone", () => {
    for (const t of ["hi, launch Quenchline to CISOs next week", "Leashgate webinar", "LinkedIn post for the changelog", "", "help me write a landing page for Leashgate"]) expect(isSmallTalk(t), t).toBe(false);
  });
});

describe("isDocQuestion", () => {
  it("catches questions about an attached document", () => {
    for (const t of ["tell me about this what does it say", "What does this say?", "summarize it", "what's in this brief", "explain this", "who is it for?", "give me the gist"])
      expect(isDocQuestion(t), t).toBe(true);
  });
  it("leaves requests to plan or write, and plain briefs, alone", () => {
    for (const t of ["", "here's the brief", "plan a campaign from this", "go ahead", "write the assets for this brief", "Q1 awareness push for Quenchline, LinkedIn only", "use this as the brief"])
      expect(isDocQuestion(t), t).toBe(false);
  });
});

describe("pickFiles", () => {
  const files = [{ name: "mock-1-vague-quenchline.md" }, { name: "mock-2-trap-webinar.md" }, { name: "mock-3-reference-changelog.md" }];
  const pick = (t: string) => pickFiles(files, t).map((f) => f.name);
  it("picks by ordinal, number or a distinctive word of the name", () => {
    expect(pick("the first one")).toEqual(["mock-1-vague-quenchline.md"]);
    expect(pick("use mock-2")).toEqual(["mock-2-trap-webinar.md"]);
    expect(pick("go with the changelog one")).toEqual(["mock-3-reference-changelog.md"]);
    expect(pick("#3")).toEqual(["mock-3-reference-changelog.md"]);
  });
  it("picks nothing when the message names no file", () => {
    expect(pick("lets go here are the briefs")).toEqual([]);
  });
});
