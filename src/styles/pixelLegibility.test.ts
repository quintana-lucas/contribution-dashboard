/// <reference types="node" />
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(p, "utf8");

describe("pixel style legibility pass", () => {
  // AC5
  it("AC5: every chart svg opts into crispEdges so bars and lines stay pixel-sharp", () => {
    const charts = [
      "src/components/BarList/BarList.tsx",
      "src/components/ColumnChart/ColumnChart.tsx",
      "src/components/PrActivityChart/PrActivityChart.tsx",
      "src/components/ReviewsChart/ReviewsChart.tsx",
    ];
    for (const file of charts) {
      const src = read(file);
      const svg = /<svg[\s\S]*?>/.exec(src)?.[0] ?? "";
      expect(svg, file).toContain('shapeRendering="crispEdges"');
    }
  });

  // AC5
  it("AC5: text sizes are rem multiples of the font's 8px grid (0.5rem steps, plus 0.75rem body)", () => {
    const css = read("src/styles/tokens.css");
    for (const m of css.matchAll(/--text-(?:xl|lg|md|sm):\s*([\d.]+)rem;/g)) {
      expect([0.5, 0.75, 1, 1.5]).toContain(Number(m[1]));
    }
  });

  // AC5
  it("AC5: bold is never synthesized for the single-weight pixel font", () => {
    expect(read("src/styles/base.css")).toContain("font-synthesis: none;");
  });
});
