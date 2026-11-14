/** Fails (exit 1) when reports/dev.json does not clear config/gate.json. */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..");
export function check(r: any, g: any): string[] {
  const d = r.designs;
  const out: string[] = [];
  if (d.gated_rules.sendableLast20 < g.gated.minSendableLast20) out.push(`gated learning ends at ${d.gated_rules.sendableLast20} sendable`);
  if (d.gated_rules.editsPerQuote > g.gated.maxEditsPerQuote) out.push(`${d.gated_rules.editsPerQuote} edits per quote`);
  if (d.gated_rules.medianTotalError > g.gated.maxMedianTotalError) out.push(`median total error ${d.gated_rules.medianTotalError}`);
  if (d.gated_rules.sendableShare < g.versusLlmQuote.minSendableRatio * d.llm_quote.sendableShare) out.push("not far enough ahead of a quote written by the model");
  if (d.gated_rules.sendableLast20 - d.naive_rules.sendableLast20 < g.versusNaive.minGainLast20) out.push("not far enough ahead of naive learning");
  if (r.fields.length.settled < g.fields.minSettledLength || r.fields.width.settled < g.fields.minSettledWidth) out.push("dimensions settled too rarely");
  if (r.familyWithGlossary < g.fields.minFamilyWithGlossary) out.push(`covering family right in ${r.familyWithGlossary}`);
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const problems = check(JSON.parse(readFileSync(join(ROOT, "reports", "dev.json"), "utf8")), JSON.parse(readFileSync(join(ROOT, "config", "gate.json"), "utf8")));
  for (const p of problems) console.log("GATE:", p);
  if (problems.length) process.exit(1);
  console.log("Gate passed.");
}
