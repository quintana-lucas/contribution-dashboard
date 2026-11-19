/// <reference types="node" />
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Vitest blanks CSS imports (including `?raw`/`?inline`), so read the file directly.
const css = readFileSync("src/styles/tokens.css", "utf8");

function block(selector: string): string {
  const start = css.indexOf(selector + " {");
  if (start < 0) throw new Error(`missing ${selector}`);
  return css.slice(start, css.indexOf("}", start));
}

function vars(body: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of body.matchAll(/(--[\w-]+):\s*([^;]+);/g)) out[m[1]] = m[2].trim();
  return out;
}

const light = vars(block(":root"));
const dark = vars(block(':root[data-theme="dark"]'));
const mediaDark = vars(block(':root:not([data-theme="light"])'));

type RGB = [number, number, number];
const rgb = (hex: string): RGB => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as RGB;
const mix = (a: RGB, b: RGB, p: number): RGB => a.map((v, i) => v * p + b[i] * (1 - p)) as RGB;
const lum = (c: RGB) => {
  const [r, g, b] = c.map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a: RGB, b: RGB) => {
  const x = lum(a);
  const y = lum(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};

describe("theme tokens", () => {
  it("AC7: the dark set under data-theme matches the media-query dark set", () => {
    expect(mediaDark).toEqual(dark);
  });

  it("#82 AC5: --color-bar is declared in both dark maps with the same value", () => {
    expect(mediaDark["--color-bar"]).toBeDefined();
    expect(dark["--color-bar"]).toBeDefined();
    expect(mediaDark["--color-bar"]).toBe(dark["--color-bar"]);
  });

  for (const [name, t] of [
    ["light", light],
    ["dark", dark],
  ] as const) {
    describe(name, () => {
      const surface = rgb(t["--color-surface"]);
      const bg = rgb(t["--color-bg"]);
      const text = rgb(t["--color-text"]);
      const accent = rgb(t["--color-accent"]);

      it("#82 AC1: bar is an independent hex, not the accent, and at least 3:1 on surface", () => {
        const bar = t["--color-bar"];
        expect(bar).toMatch(/^#[0-9a-f]{6}$/i);
        expect(bar).not.toBe("var(--color-accent)");
        expect(bar.toLowerCase()).not.toBe(t["--color-accent"].toLowerCase());
        expect(ratio(rgb(bar), surface)).toBeGreaterThanOrEqual(3);
      });

      it("AC9: icon is at least 3:1 on surface and on the 12%/20% accent tints", () => {
        expect(ratio(text, surface)).toBeGreaterThanOrEqual(3);
        expect(ratio(text, mix(accent, surface, 0.12))).toBeGreaterThanOrEqual(3);
        expect(ratio(text, mix(accent, surface, 0.2))).toBeGreaterThanOrEqual(3);
      });

      it("AC9: dashed border is at least 3:1 on surface", () => {
        expect(ratio(rgb(t["--color-border-dashed"]), surface)).toBeGreaterThanOrEqual(3);
      });

      it("AC9: focus ring is at least 3:1 on surface and bg", () => {
        expect(ratio(accent, surface)).toBeGreaterThanOrEqual(3);
        expect(ratio(accent, bg)).toBeGreaterThanOrEqual(3);
      });
    });
  }
});
