import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const r = JSON.parse(readFileSync(join(import.meta.dirname, "..", "reports", "dev.json"), "utf8"));

describe("the committed dev report", () => {
  it("shows code measuring and pricing beating a quote written by the model, and gated learning beating naive", () => {
    const d = r.designs;
    expect(d.spec_code.sendableShare).toBeGreaterThan(d.llm_quote.sendableShare * 3);
    expect(d.gated_rules.sendableLast20).toBeGreaterThan(d.naive_rules.sendableLast20 + 0.2);
    expect(d.gated_rules.editsPerQuote).toBeLessThan(d.llm_quote.editsPerQuote / 4);
  });
  it("settles dimensions better than the model reads them", () => {
    expect(r.fields.width.settled).toBeGreaterThan(r.fields.width.read + 0.1);
  });
});
