import { describe, expect, it } from "vitest";
import { CONFIRM_REPLIES, PLAN_REPLIES, isButtonReply } from "./confirm";

describe("isButtonReply", () => {
  it("recognises the plan and confirm buttons", () => {
    expect(isButtonReply(PLAN_REPLIES.approve)).toBe(true);
    expect(isButtonReply(`${PLAN_REPLIES.removePrefix}LinkedIn post: healthcare`)).toBe(true);
    expect(isButtonReply(CONFIRM_REPLIES.no)).toBe(true);
  });
  it("treats typed answers as answers", () => {
    expect(isButtonReply("yes")).toBe(false);
    expect(isButtonReply("healthcare")).toBe(false);
  });
});
