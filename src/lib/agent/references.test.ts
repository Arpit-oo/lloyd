import { describe, expect, it } from "vitest";
import { extractUrls } from "./references";

import { referenceUrls } from "./references";

describe("referenceUrls", () => {
  it("keeps links the marketer wants to resemble, not CTA targets", () => {
    expect(referenceUrls("CTA goes to acme.com/demo. Make the page look like stripe.dev.")).toEqual(["https://stripe.dev"]);
    expect(referenceUrls("Sign up at https://acme.com/register")).toEqual([]);
  });
});

describe("extractUrls", () => {
  it("finds full links and bare domains, not emails", () => {
    expect(extractUrls("make it like stripe.dev and https://linear.app/features, mail me at a@b.com")).toEqual(["https://linear.app/features", "https://stripe.dev"]);
  });
  it("keeps paths on bare domains and caps at three", () => {
    expect(extractUrls("vercel.com/home a.io b.io c.io")).toEqual(["https://vercel.com/home", "https://a.io", "https://b.io"]);
  });
  it("ignores plain words with dots", () => {
    expect(extractUrls("version 2.0 is fine. e.g. this")).toEqual([]);
  });
});
