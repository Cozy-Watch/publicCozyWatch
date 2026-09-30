import {
  ACCENT_COLORS,
  DEFAULT_ACCENT_COLOR,
  isAccentColor,
} from "./theme";

describe("accent colors", () => {
  it("accepts every curated Radix accent color", () => {
    for (const accentColor of ACCENT_COLORS) {
      expect(isAccentColor(accentColor)).toBe(true);
    }
  });

  it("accepts gray for the retro accent", () => {
    expect(isAccentColor("gray")).toBe(true);
  });

  it("rejects unsupported values", () => {
    expect(isAccentColor("purple")).toBe(false);
    expect(isAccentColor("Violet")).toBe(false);
    expect(isAccentColor(null)).toBe(false);
    expect(isAccentColor({})).toBe(false);
  });

  it("uses violet as the safe default", () => {
    expect(DEFAULT_ACCENT_COLOR).toBe("violet");
  });
});
