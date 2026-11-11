import { describe, expect, it } from "vitest";
import { loopLevelColor, loopLevelHue } from "./loop-colors";

describe("loopLevelHue", () => {
  it("starts at the established violet hue", () => {
    expect(loopLevelHue(0)).toBe(258);
  });

  it("shifts the hue gradually for each nesting level", () => {
    expect([0, 1, 2, 3].map(loopLevelHue)).toEqual([258, 222, 186, 150]);
  });

  it("keeps deeper levels on the last colormap stop", () => {
    const last = loopLevelHue(5);
    expect(loopLevelHue(6)).toBe(last);
    expect(loopLevelHue(40)).toBe(last);
  });
});

describe("loopLevelColor", () => {
  it("derives every loop color from the level hue", () => {
    const color = loopLevelColor(2);
    expect(color.line.startsWith("hsl(186 ")).toBe(true);
    expect(color.fill.startsWith("hsl(186 ")).toBe(true);
    expect(color.barFill.startsWith("hsl(186 ")).toBe(true);
    expect(color.text.startsWith("hsl(186 ")).toBe(true);
  });

  it("changes the color between nested levels", () => {
    expect(loopLevelColor(0).line).not.toBe(loopLevelColor(1).line);
  });
});
