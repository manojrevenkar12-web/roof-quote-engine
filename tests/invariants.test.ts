import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(import.meta.dirname, "..");
const files = (dir: string): string[] =>
  readdirSync(join(ROOT, dir), { withFileTypes: true }).flatMap((f) => (f.isDirectory() ? files(join(dir, f.name)) : [join(dir, f.name)]));

describe("invariants (AGENTS.md)", () => {
  it("nothing that serves imports the world", () => {
    for (const f of files("src").filter((f) => !f.includes("world"))) {
      expect(readFileSync(join(ROOT, f), "utf8"), f).not.toMatch(/world\//);
    }
  });
  it("the world does not read the engine's settings", () => {
    for (const f of files("src/world")) expect(readFileSync(join(ROOT, f), "utf8")).not.toMatch(/engine\.json/);
  });
  it("only the evaluation, the export and the tests import the world", () => {
    for (const f of files("scripts")) {
      if (/world\/sim/.test(readFileSync(join(ROOT, f), "utf8"))) expect(["scripts/evaluate.ts", "scripts/export.ts"]).toContain(f);
    }
  });
});
