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

  it("AC10: row-active and scroll-edge tokens have parity across the two dark blocks", () => {
    for (const k of ["--color-row-active", "--color-scroll-edge"]) {
      expect(light[k]).toBeDefined();
      expect(dark[k]).toBeDefined();
      expect(mediaDark[k]).toBe(dark[k]);
    }
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

      it("AC9: icon is at least 3:1 on surface and on the 12%/20% accent tints", () => {
        expect(ratio(text, surface)).toBeGreaterThanOrEqual(3);
        expect(ratio(text, mix(accent, surface, 0.12))).toBeGreaterThanOrEqual(3);
        expect(ratio(text, mix(accent, surface, 0.2))).toBeGreaterThanOrEqual(3);
      });

      it("AC9: row-active is raised (lighter than surface) in dark and distinct in light", () => {
        const active = rgb(t["--color-row-active"]);
        if (name === "dark") expect(lum(active)).toBeGreaterThan(lum(surface));
        else expect(active).not.toEqual(surface);
      });

      it("AC10: text and muted text are at least 4.5:1 on row-active", () => {
        const active = rgb(t["--color-row-active"]);
        expect(ratio(text, active)).toBeGreaterThanOrEqual(4.5);
        expect(ratio(rgb(t["--color-text-muted"]), active)).toBeGreaterThanOrEqual(4.5);
      });

      // AC10 (pending #83): the +/- add/delete colours are not tokens yet, so their
      // contrast on row-active is not checked here. Add it when #83 lands.

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
