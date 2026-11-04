import { describe, expect, it } from "vitest";
import { isSmallTalk } from "./agent";

describe("isSmallTalk", () => {
  it("catches greetings and help on their own", () => {
    for (const t of ["hi", "Hi!", "hey there", "hello Lloyd", "thanks", "what can you do?", "good morning", "test"]) expect(isSmallTalk(t), t).toBe(true);
  });
  it("leaves anything that could be a brief alone", () => {
    for (const t of ["hi, launch Quenchline to CISOs next week", "Leashgate webinar", "LinkedIn post for the changelog", "", "help me write a landing page for Leashgate"]) expect(isSmallTalk(t), t).toBe(false);
  });
});
