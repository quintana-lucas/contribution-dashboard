/// <reference types="node" />
import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Vitest blanks CSS imports, so read the sources directly.
const dir = "src/components";
const files = readdirSync(dir, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .flatMap((d) =>
    readdirSync(`${dir}/${d.name}`)
      .filter((f) => f.endsWith(".module.css"))
      .map((f) => `${dir}/${d.name}/${f}`),
  );

function declarations(prop: RegExp): { file: string; value: string }[] {
  const out: { file: string; value: string }[] = [];
  for (const file of files) {
    const css = readFileSync(file, "utf8");
    for (const m of css.matchAll(/(?:^|[;{\s])([a-z-]+)\s*:\s*([^;}]+)/g)) {
      if (prop.test(m[1])) out.push({ file, value: m[2].trim() });
    }
  }
  return out;
}

describe("pixel style sweep", () => {
  it("finds the component stylesheets", () => {
    expect(files.length).toBeGreaterThan(20);
  });

  it("AC1: no module CSS sets a non-zero literal border-radius", () => {
    const radii = declarations(/^border(-[a-z]+){0,2}-radius$/);
    expect(radii.length).toBeGreaterThan(0);
    for (const { file, value } of radii) {
      const ok = value.split(/\s+/).every((v) => v === "0" || /^var\(--radius-(md|pill)\)$/.test(v));
      expect(ok, `${file}: border-radius: ${value}`).toBe(true);
    }
  });

  it("AC2: borders take their width from --border-width, never a literal Npx", () => {
    const borders = declarations(/^border(-(top|right|bottom|left))?$/);
    expect(borders.length).toBeGreaterThan(0);
    for (const { file, value } of borders) {
      expect(value, `${file}: border: ${value}`).not.toMatch(/(^|\s)\d+(\.\d+)?px\b/);
    }
  });

  it("AC2 AC4: tooltip, modal and badge use the pixel shadow token", () => {
    for (const name of ["ChartTooltip", "Modal", "PrStateBadge", "Skeleton"]) {
      const css = readFileSync(`${dir}/${name}/${name}.module.css`, "utf8");
      expect(css, name).toContain("box-shadow: var(--shadow-pixel);");
    }
  });
});
