/// <reference types="node" />
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Vitest blanks CSS imports, so read the source directly.
const css = readFileSync("src/components/WaitingWidget/WaitingWidget.module.css", "utf8");

// Match a rule by its exact selector at the start of a line, so compound selectors cannot match.
function rule(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const m = new RegExp(`^${escaped} \\{([^}]*)\\}`, "m").exec(css);
  if (!m) throw new Error(`missing ${selector}`);
  return m[1];
}

describe("WaitingWidget styles", () => {
  it("#88 AC8: rows are separated by hairlines, not nested bordered cards", () => {
    const item = rule(".item");
    expect(item).not.toMatch(/border/);
    expect(item).not.toMatch(/background/);
    expect(item).toContain("padding: var(--space-3) 0;");
    expect(rule(".item + .item")).toContain("border-top: 1px solid var(--color-border);");
    expect(rule(".list")).toContain("gap: 0;");
  });

  it("#88 AC4: the Overdue chip is medium weight and keeps its border", () => {
    const overdue = rule(".overdue");
    expect(overdue).toContain("font-weight: var(--weight-medium);");
    expect(overdue).toContain("border: 1px solid var(--color-caution);");
    expect(overdue).not.toMatch(/font-weight:\s*700/);
  });

  it("#84 AC1 AC2 AC6: the chip and overdue age use caution tokens, nowrap chip", () => {
    const overdue = rule(".overdue");
    expect(overdue).toContain("background: var(--color-caution-bg);");
    expect(overdue).toContain("color: var(--color-caution);");
    expect(overdue).toContain("white-space: nowrap;");
    expect(rule(".ageOverdue")).toContain("color: var(--color-caution);");
  });

  it("#88 AC4: tokens only, no hex colours", () => {
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });

  it("#88 AC1: the row title is a quieter, medium-weight line smaller than the widget heading", () => {
    const title = rule(".title");
    expect(title).toContain("font-size: var(--text-sm);");
    expect(title).toContain("font-weight: var(--weight-medium);");
    expect(title).toContain("line-height: var(--text-sm-line);");
    const widgetCss = readFileSync("src/components/Widget/Widget.module.css", "utf8");
    const widgetTitle = /^\.title \{([^}]*)\}/m.exec(widgetCss)?.[1] ?? "";
    expect(widgetTitle).toContain("font-size: var(--text-md);");
    expect(widgetTitle).not.toContain("font-size: var(--text-sm);");
  });

  it("#88 AC3: the age value is emphasised, the label muted, and the pair does not wrap", () => {
    const value = rule(".ageValue");
    expect(value).toContain("color: var(--color-text);");
    expect(value).toContain("font-weight: var(--weight-medium);");
    expect(value).toContain("font-variant-numeric: tabular-nums;");
    expect(rule(".age")).toContain("white-space: nowrap;");
    expect(rule(".ageLabel")).toContain("color: var(--color-text-muted);");
    expect(rule(".overdue")).toContain("white-space: nowrap;");
  });

  it("#88 AC6: the +/- figure is demoted by position only, with no colour of its own", () => {
    const lines = rule(".lines");
    expect(lines).toContain("white-space: nowrap;");
    expect(lines).not.toMatch(/color/);
    expect(lines).not.toMatch(/opacity/);
  });

  it("#88 AC11: only the text and muted text tokens are used, with no colour literals", () => {
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(css).not.toMatch(/rgba?\(/);
    expect(css).not.toMatch(/hsla?\(/);
    for (const m of css.matchAll(/color:\s*([^;]+);/g)) {
      expect(m[1]).toMatch(/^var\(--color-/);
    }
    expect(rule(".title")).toContain("color: var(--color-text);");
  });
});
