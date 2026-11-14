/** Writes README.md and web/public/data/console.json from reports/*.json. Never edit the results by hand. */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..");
const REPO = "https://github.com/manojrevenkar12-web/roof-quote-engine";
export const NAMES: Record<string, string> = {
  llm_quote: "LLM writes the whole quote",
  spec_code: "LLM reads, code measures and prices",
  naive_rules: "+ learns every edit at once",
  gated_rules: "**+ learns habits through a replay gate**",
};
const pct = (x: number, d = 1) => `${(x * 100).toFixed(d)}%`;
const table = (head: string[], rows: (string | number)[][], numeric = true) =>
  [`| ${head.join(" | ")} |`, `|${["---", ...head.slice(1).map(() => (numeric ? "--:" : "---"))].join("|")}|`, ...rows.map((r) => `| ${r.join(" | ")} |`)].join("\n");

function designTable(r: any) {
  return table(
    ["Design", "Sent without edits", "Last 20 jobs per roofer", "Edits per quote", "Median total error", "Office minutes per quote", "LLM cost per quote"],
    Object.entries(NAMES).map(([k, n]) => {
      const d = r.designs[k];
      return [n, pct(d.sendableShare), pct(d.sendableLast20), d.editsPerQuote.toFixed(2), pct(d.medianTotalError), d.officeMinutesPerQuote.toFixed(1), `€${d.llmCostPerQuoteEur.toFixed(3)}`];
    }),
  );
}

const ruleText = (x: any) =>
  x.type === "waste" ? `waste on covering ${Math.round(x.value * 100)}%` : `${x.on ? "include" : "leave out"} ${x.kind}${x.when === "always" ? "" : ` when ${x.when}`}`;

function readme(r: any, h: any | null) {
  const d = r.designs;
  const g = d.gated_rules;
  const habitRows = Object.entries(r.learned).map(([p, rules]: [string, any]) => {
    const hb = r.habits[p];
    return [`${p} ${hb.name}`, `waste ${Math.round(hb.waste * 100)}%, scaffold ${hb.scaffold}, ${hb.underlay ? "new" : "keeps"} underlay, ${hb.gutters ? "offers" : "skips"} gutters`, (rules as any[]).map(ruleText).join("; ") || "defaults fit"];
  });
  const f = r.fields;
  return `# roof-quote-engine

A roofer in Germany writes quotes in the evening: a voice note from the site visit, a few photos, sometimes the
architect's plan, and a catalog only they know how to use. This is a full-stack TypeScript engine that turns those
into a quote **priced from the roofer's own catalog**, the way **that roofer** would have written it, and learns their
habits from the edits they make before sending, without learning the wrong ones.

- **The model reads, code measures and prices.** An LLM turns the voice note and photo notes into a structured roof
  spec (Vercel AI SDK, zod schema). Dimensions come from the architect's plan (parsed by code) or a satellite
  footprint; a rough "so ungefähr zehn mal acht" is never priced, it becomes a question to the customer. Quantities are
  geometry; prices come from the catalog.
- **Each roofer's habits are learned from their edits**: scaffolding from two storeys or always, new underlay on a
  renovation or not, gutters offered when the old ones are rusted, their waste factor. A rule is kept only when
  rebuilding that roofer's past quotes with it needs fewer edits than without (a one-sided sign test). The trade's own
  words ("Doppelmulden", "Biber", "Harzer Pfanne") go into a shared glossary the same way.
- **Evals gate every change**: \`scripts/evaluate.ts\` compares four designs on the same jobs and luck, \`scripts/gate.ts\`
  fails CI when the numbers fall, and \`evals/\` holds a promptfoo extraction eval for the live model.

On ${r.volume.partners} simulated roofers and ${r.volume.jobs} jobs:

- **${pct(g.sendableLast20)} of quotes sent without a single edit** over each roofer's last 20 jobs, against ${pct(d.llm_quote.sendableLast20)} when the
  LLM writes the whole quote and ${pct(d.naive_rules.sendableLast20)} when every edit becomes a rule.
- **${g.editsPerQuote.toFixed(2)} edits per quote** against ${d.llm_quote.editsPerQuote.toFixed(2)}; median total off by ${pct(g.medianTotalError)} against ${pct(d.llm_quote.medianTotalError)}.
- **${g.officeMinutesPerQuote.toFixed(1)} office minutes per quote** against ${r.manualMinutesPerQuote} by hand, at €${g.llmCostPerQuoteEur.toFixed(3)} of model cost.
- **Dimensions right in ${pct(f.width.settled)} of jobs** once code settles them, against ${pct(f.width.read)} as the model reads them; the covering
  right in ${pct(r.familyWithGlossary)} with the learned glossary against ${pct(f.family.read)} without.

![Console](docs/console.png)

## Results on the dev world

${designTable(r)}

A quote counts as sent without edits when the roofer changed no line (quantity within 3%, same items, same prices)
and the total is within 3%.

### What the model reads, and what code settles

${table(["Field", "As the model reads it", "After code settles it"], Object.entries(f).map(([k, v]: [string, any]) => [k, pct(v.read), pct(v.settled)]))}

Plans were parsed for ${r.sources.plan?.jobs ?? 0} jobs, satellite footprints used for ${r.sources.satellite?.jobs ?? 0}, and ${r.volume.questions} questions sent to customers
(${r.volume.answered} answered) when only a rough voice size was left.

### Habits learned per roofer (gated)

${table(["Roofer", "True habits (simulation)", "Rules learned"], habitRows, false)}

Glossary learned across roofers: ${Object.entries(r.glossary).map(([k, v]) => `"${k}" = ${String(v).replace("_", " ")}`).join(", ")}.

## Held-out world (run once)

${h ? `Other roofers and other ways of speaking, run once with the code and settings the dev world ended on (\`config/heldout.lock\`).

${designTable(h)}

What went wrong and what changed afterwards: [docs/heldout.md](docs/heldout.md).` : "Not run yet. `npx tsx scripts/evaluate.ts --heldout` runs it once and writes `config/heldout.lock`."}

## How it is built

| Part | Files | What it does |
|---|---|---|
| Read | \`src/llm/reader.ts\`, \`prompts/extract.md\` | \`generateObject\` with the \`JobSpec\` zod schema (Vercel AI SDK, Anthropic). |
| Settle | \`src/core/measure.ts\` | Plan parsed by code, satellite footprint, customer question; storeys and skylights from photo notes; glossary. |
| Take off and price | \`src/core/takeoff.ts\`, \`src/core/quote.ts\` | Roof area, ridge, hips, gutters, downpipes, scaffold; lines from the roofer's catalog with their rules. |
| Learn | \`src/core/learn.ts\` | Evidence from each sent quote; naive or replay-gated rules; glossary. |
| Store and serve | \`src/db/schema.ts\`, \`src/service.ts\`, \`src/api/app.ts\` | Drizzle on Postgres (PGlite in tests); Express: \`POST /jobs\`, \`POST /quotes/:id/sent\`, \`GET /partners/:id/rules\`. |
| Evaluate | \`scripts/evaluate.ts\`, \`scripts/gate.ts\`, \`evals/\` | Designs on the same jobs; CI gate; promptfoo extraction eval. |
| Console | \`web/\` | React, Vite, React Query, Framer Motion. |

## Run it

\`\`\`bash
npm ci && npm test                     # unit, API (PGlite) and invariant tests
npx tsx scripts/evaluate.ts            # dev world -> reports/dev.json
npx tsx scripts/gate.ts                # quality gate (config/gate.json)
npx tsx scripts/readme.ts              # README.md and the console data
ANTHROPIC_API_KEY=... npm run serve    # API with the model reader
cd web && npm ci && npm run build      # console
\`\`\`

## Limits

- Roofers, catalogs, jobs and the model's mistakes are simulated, with their behaviour in \`config/world.json\`. The
  model reader and the promptfoo eval are written for Anthropic models and have not been run on these jobs here.
- Photo notes are text (as an image model would caption them); measuring from imagery itself is not built.
- No mobile app: the console is web only.

Repository: ${REPO}
`;
}

const r = JSON.parse(readFileSync(join(ROOT, "reports", "dev.json"), "utf8"));
const hp = join(ROOT, "reports", "heldout.json");
const h = existsSync(hp) ? JSON.parse(readFileSync(hp, "utf8")) : null;
writeFileSync(join(ROOT, "README.md"), readme(r, h));
const slim = (x: any) => ({ world: x.world, volume: x.volume, designs: x.designs, curves: x.curves, bucket: x.bucket, fields: x.fields, familyWithGlossary: x.familyWithGlossary, ledger: x.ledger, learned: x.learned, habits: x.habits, glossary: x.glossary, example: x.example, sources: x.sources });
mkdirSync(join(ROOT, "web", "public", "data"), { recursive: true });
writeFileSync(join(ROOT, "web", "public", "data", "console.json"), JSON.stringify({ dev: slim(r), heldout: h ? slim(h) : null, names: Object.fromEntries(Object.entries(NAMES).map(([k, v]) => [k, v.replace(/\*\*/g, "")])) }) + "\n");
