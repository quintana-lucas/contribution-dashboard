import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx)$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

describe("visx dependencies", () => {
  it("AC1: every @visx/* package in package.json is imported by non-test code under src/", () => {
    const pkg = JSON.parse(readFileSync("package.json", "utf8")) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const visx = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies }).filter((name) =>
      name.startsWith("@visx/"),
    );
    expect(visx.length).toBeGreaterThan(0);

    const source = sourceFiles("src")
      .map((file) => readFileSync(file, "utf8"))
      .join("\n");
    for (const name of visx) {
      expect(source, name).toMatch(new RegExp(`from ['"]${name}(?:/[^'"]*)?['"]`));
    }
  });
});
