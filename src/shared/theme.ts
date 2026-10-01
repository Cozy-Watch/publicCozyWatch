export const ACCENT_COLORS = [
  "violet",
  "indigo",
  "blue",
  "cyan",
  "teal",
  "green",
  "orange",
  "red",
  "gray",
] as const;

export type AccentColor = (typeof ACCENT_COLORS)[number];

export const DEFAULT_ACCENT_COLOR: AccentColor = "violet";

export const ACCENT_COLOR_CHANNELS = {
  get: "get-application-accent-color",
  set: "set-application-accent-color",
  updated: "application-accent-color-updated",
} as const;

export const isAccentColor = (value: unknown): value is AccentColor =>
  typeof value === "string" &&
  ACCENT_COLORS.includes(value as AccentColor);
