import { describe, expect, it } from "vitest";
import { EMPTY_STYLE_REQUEST as none, mergeStyle } from "./design";

const brand = { palette: ["#d94f2b"], fonts: ["Söhne"] };

describe("mergeStyle", () => {
  it("adds a colour override and flags it as off-brand", () => {
    expect(mergeStyle(undefined, { ...none, primary: "#8F00FF" }, brand)).toEqual({ primary: "#8f00ff", offBrand: ["#8f00ff"] });
  });
  it("keeps earlier settings and does not flag brand colours or fonts", () => {
    expect(mergeStyle({ density: "roomy" }, { ...none, accent: "#D94F2B", font_display: "söhne" }, brand)).toEqual({ density: "roomy", accent: "#d94f2b", fontDisplay: "Söhne" });
  });
  it("accepts layout settings and allowed fonts, flags non-brand fonts", () => {
    expect(mergeStyle(undefined, { ...none, hero_layout: "centered", corners: "pill", font_display: "Fraunces" }, brand)).toEqual({
      heroLayout: "centered",
      corners: "pill",
      fontDisplay: "Fraunces",
      offBrand: ["Fraunces"],
    });
  });
  it("ignores invalid colours and unknown fonts; resets on request", () => {
    expect(mergeStyle(undefined, { ...none, primary: "purple", font_body: "Comic Sans" }, brand)).toBeUndefined();
    expect(mergeStyle({ primary: "#8f00ff" }, { ...none, reset_to_brand: true }, brand)).toBeUndefined();
    expect(mergeStyle(undefined, none, brand)).toBeUndefined();
  });
});
