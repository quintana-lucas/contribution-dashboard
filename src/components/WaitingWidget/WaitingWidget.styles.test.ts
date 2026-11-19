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
    expect(overdue).toContain("border: 1px solid var(--color-text);");
    expect(overdue).not.toMatch(/font-weight:\s*700/);
  });

  it("#88 AC4: tokens only, no hex colours", () => {
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });
});
