import { loadFont } from "@remotion/fonts";
import { staticFile } from "remotion";

// Geist and Geist Mono are the fonts of the quiz page. The files are variable fonts, so one file
// covers the weights 400 to 600.
loadFont({
  family: "Geist Mono",
  url: staticFile("fonts/geist-mono-latin.woff2"),
  weight: "400 600",
});
loadFont({
  family: "Geist",
  url: staticFile("fonts/geist-latin.woff2"),
  weight: "400 600",
});

/** Frames per second of every composition. */
export const FPS = 30;

/** Returns the frame at a time in seconds. Each time stays the same at a different frame rate. */
export const sec = (seconds: number): number => Math.round(seconds * FPS);

/** Font stack for all text in the video. */
export const MONO = "'Geist Mono', ui-monospace, monospace";

/**
 * Colors of the dark theme of the quiz page, from `skills/quiz/tokens.css`. Color marks only a
 * state, as on the page.
 */
export const COLOR = {
  background: "oklch(0 0 0)",
  text: "oklch(0.946 0 0)",
  dim: "oklch(0.706 0 0)",
  faint: "oklch(0.45 0 0)",
  track: "oklch(0.301 0 0)",
  green: "oklch(73.1% 0.2158 148.29)",
  red: "oklch(69.96% 0.2136 22.03)",
  amber: "oklch(82% 0.16 80)",
};

/** Easing for text that comes in, the same curve as the page transitions. */
export const EASE_OUT = [0.22, 1, 0.36, 1] as const;
