/// <reference types="node" />
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { THEME_STORAGE_KEY, readStoredTheme } from "./theme";

const html = readFileSync("index.html", "utf8");

const head = html.slice(html.indexOf("<head>"), html.indexOf("</head>"));
const inlineMatch = /<script([^>]*)>([\s\S]*?)<\/script>/.exec(head);
if (!inlineMatch) throw new Error("missing inline script in <head>");
const inlineAttrs = inlineMatch[1];
const inlineSource = inlineMatch[2];

function runPrepaint(): string | null {
  document.documentElement.removeAttribute("data-theme");
  new Function(inlineSource)();
  return document.documentElement.getAttribute("data-theme");
}

afterEach(() => {
  vi.restoreAllMocks();
  window.localStorage.clear();
  document.documentElement.removeAttribute("data-theme");
});

describe("pre-paint theme script", () => {
  it("AC4: is a blocking inline script in <head> before the module script", () => {
    expect(inlineAttrs.trim()).toBe("");
    expect(inlineAttrs).not.toMatch(/async|defer|module|src=/);
    const moduleIdx = html.indexOf('type="module"');
    expect(moduleIdx).toBeGreaterThan(-1);
    expect(html.indexOf(inlineSource)).toBeLessThan(moduleIdx);
    expect(html.indexOf("</head>")).toBeLessThan(moduleIdx);
    expect(inlineSource).toContain(`'${THEME_STORAGE_KEY}'`);
  });

  for (const stored of ["light", "dark"] as const) {
    it(`AC4: applies stored ${stored} theme, matching readStoredTheme`, () => {
      window.localStorage.setItem(THEME_STORAGE_KEY, stored);
      expect(runPrepaint()).toBe(stored);
      expect(readStoredTheme()).toBe(stored);
    });
  }

  it("AC5: sets nothing when no theme is stored", () => {
    expect(runPrepaint()).toBeNull();
    expect(readStoredTheme()).toBeNull();
  });

  it("AC5: ignores an invalid stored value", () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, "purple");
    expect(runPrepaint()).toBeNull();
    expect(readStoredTheme()).toBeNull();
  });

  it("AC5: does not throw and sets nothing when storage throws", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("denied");
    });
    expect(() => runPrepaint()).not.toThrow();
    expect(runPrepaint()).toBeNull();
    expect(readStoredTheme()).toBeNull();
  });
});
