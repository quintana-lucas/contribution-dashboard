/// <reference types="node" />
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Vitest blanks CSS imports, so read the source directly.
const css = readFileSync("src/components/Widget/Widget.module.css", "utf8");

function rule(selector: string): string {
  const start = css.indexOf(selector + " {");
  if (start < 0) throw new Error(`missing ${selector}`);
  return css.slice(start, css.indexOf("}", start));
}

describe("Widget heading styles", () => {
  it("#88 AC9: .title uses the quieter text tokens and no literals", () => {
    const title = rule(".title");
    expect(title).toContain("font-size: var(--text-md);");
    expect(title).toContain("font-weight: var(--text-lg-weight);");
    expect(title).toContain("line-height: var(--text-md-line);");
    expect(title).not.toMatch(/\d+px/);
    expect(title).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });
});
