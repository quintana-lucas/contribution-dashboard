/// <reference types="node" />
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const html = readFileSync("index.html", "utf8");

describe("dashboard favicon", () => {
  it("AC2: the icon link points to /dashboard-icon.svg, which ships from public/", () => {
    const link = /<link[^>]*rel="icon"[^>]*>/.exec(html);
    expect(link).not.toBeNull();
    expect(link?.[0]).toContain('href="/dashboard-icon.svg"');
    expect(existsSync("public/dashboard-icon.svg")).toBe(true);
  });

  it("AC3: the Vite logo file is gone and index.html no longer references it", () => {
    expect(existsSync("public/favicon.svg")).toBe(false);
    expect(html).not.toContain("favicon.svg");
    expect(html.toLowerCase()).not.toContain("vite.svg");
  });
});
