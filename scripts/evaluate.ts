/**
 * Every design on the same roofers, jobs and luck. Writes reports/<world>.json.
 *
 *   npx tsx scripts/evaluate.ts             # the dev world
 *   npx tsx scripts/evaluate.ts --heldout   # the held-out world, once (writes config/heldout.lock)
 */
import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { evidence, gated, glossaryEvidence, glossaryFrom, naive, type Decision, type GlossaryEvidence, type History } from "../src/core/learn.js";
import { materialPhrase, settle } from "../src/core/measure.js";
import { buildQuote, total, wasteOf, type Defaults } from "../src/core/quote.js";
import { diff, edits, sendable, totalError } from "../src/core/score.js";
import type { JobSpec, Line, Rule } from "../src/core/types.js";
import { World } from "../src/world/sim.js";

const ROOT = join(import.meta.dirname, "..");
const load = (name: string) => JSON.parse(readFileSync(join(ROOT, "config", `${name}.json`), "utf8"));

export const DESIGNS = {
  llm_quote: "LLM writes the whole quote",
  spec_code: "LLM reads, code measures and prices",
  naive_rules: "+ learns every edit at once",
  gated_rules: "+ learns habits through a replay gate",
} as const;
type D = keyof typeof DESIGNS;

const FIELDS = ["length", "width", "pitch", "storeys", "family", "skylights", "chimneys", "renovation"] as const;
const fieldRight = (f: (typeof FIELDS)[number], a: JobSpec, t: JobSpec) =>
  f === "length" || f === "width" ? Math.abs(a[f] - t[f]) <= 0.03 * t[f] : a[f] === t[f];

export function evaluate(worldName: string) {
  const wc = load(worldName);
  const cfg = load("engine");
  const world = new World(wc);
  const d: Defaults = cfg.defaults;
  const pr = cfg.prices;
  const within = cfg.acceptance.sendableWithin;
  const out: Record<string, any> = {};
  const curves: Record<string, number[]> = {};
  const ledger: Record<string, Decision[]> = {};
  const learned: Record<string, Rule[]> = {};
  const fields = { read: Object.fromEntries(FIELDS.map((f) => [f, 0])), settled: Object.fromEntries(FIELDS.map((f) => [f, 0])) } as Record<string, Record<string, number>>;
  const sources: Record<string, { jobs: number; withinOnePct: number }> = {};
  const glossaries: Record<string, Record<string, string>> = {};
  let familyGlossary = 0;
  // the example on the console: the last job of the first roofer, as the gated engine proposed it, whatever happened
  const exampleJob = world.jobs.filter((j) => j.partner === world.partners[0].id).at(-1)!;
  let exampleProposed: Line[] = [];
  let exampleLlm: Line[] = [];
  let questions = 0;
  let answered = 0;
  const bucket = 10;
  for (const design of Object.keys(DESIGNS) as D[]) {
    const stat = { jobs: 0, sendable: 0, edits: 0, errSum: 0, errs: [] as number[], tokensIn: 0, tokensOut: 0, minutes: 0, questions: 0, rules: 0 };
    const byBucket: number[][] = [];
    // the glossary is the trade's, shared across roofers: learned in job order across all of them
    const gloss: GlossaryEvidence = {};
    for (const p of world.partners) {
      let rules: Rule[] = [];
      const history: History = [];
      const wastes: number[] = [];
      const log: Decision[] = [];
      for (const job of world.jobs.filter((j) => j.partner === p.id)) {
        const read = world.extract(job.id) as JobSpec;
        const truth = world.spec(job.id);
        const final = world.truthQuote(job.id);
        let proposed: Line[];
        let spec = read;
        if (design === "llm_quote") {
          proposed = world.llmQuote(job.id, read);
          stat.tokensIn += wc.llm.tokensQuote;
          stat.tokensOut += wc.llm.outTokensQuote;
        } else {
          const glossary = design === "gated_rules" ? glossaryFrom(gloss, cfg.learning.minSupport - 1) : design === "naive_rules" ? glossaryFrom(gloss, 1) : {};
          const m = settle(job.id, job.inputs, read, { satellite: (id) => world.satellite(id), ask: (id, f) => world.answer(id, f) }, cfg.measurement, glossary);
          spec = m.spec;
          stat.questions += m.questions.length;
          if (design === "spec_code") {
            questions += m.questions.length;
            answered += m.questions.length && m.source === "customer" ? 1 : 0;
            sources[m.source] ??= { jobs: 0, withinOnePct: 0 };
            sources[m.source].jobs++;
            sources[m.source].withinOnePct += Math.abs(spec.length - truth.length) <= 0.01 * truth.length ? 1 : 0;
            for (const f of FIELDS) {
              fields.read[f] += fieldRight(f, read, truth) ? 1 : 0;
              fields.settled[f] += fieldRight(f, spec, truth) ? 1 : 0;
            }
          }
          if (design === "gated_rules") familyGlossary += spec.family === truth.family ? 1 : 0;
          proposed = buildQuote(spec, p.catalog, d, rules);
          stat.tokensIn += wc.llm.tokensExtract;
          stat.tokensOut += wc.llm.outTokensExtract;
        }
        if (design === "gated_rules" && job.id === exampleJob.id) exampleProposed = proposed;
        if (design === "llm_quote" && job.id === exampleJob.id) exampleLlm = proposed;
        const ok = sendable(proposed, final, within);
        const e = edits(diff(proposed, final));
        const err = totalError(proposed, final);
        stat.jobs++;
        stat.sendable += ok ? 1 : 0;
        stat.edits += e;
        stat.errs.push(err);
        stat.minutes += e * pr.minutesPerEdit + 5;
        (byBucket[Math.floor(job.seq / bucket)] ??= []).push(ok ? 1 : 0);
        // learning from the sent quote
        if (design === "naive_rules" || design === "gated_rules") {
          const ev = evidence(proposed, final, p.catalog, wasteOf(d, rules));
          if (ev.waste !== null && Math.abs(ev.waste) < 0.5) wastes.push(ev.waste);
          history.push({ jobId: job.id, spec, final });
          glossaryEvidence(gloss, materialPhrase(job.inputs.voice), proposed, final, p.catalog);
          if (design === "naive_rules") rules = naive(rules, ev);
          else {
            const g = gated(rules, history, p.catalog, d, cfg.learning, wastes, job.seq);
            rules = g.rules;
            log.push(...g.log);
          }
        }
      }
      stat.rules += rules.length;
      if (design === "gated_rules") {
        glossaries.gated = glossaryFrom(gloss, cfg.learning.minSupport - 1);
        ledger[p.id] = log;
        learned[p.id] = rules;
      }
    }
    const errs = [...stat.errs].sort((a, b) => a - b);
    const cost = (stat.tokensIn * pr.inPerMtokEur + stat.tokensOut * pr.outPerMtokEur) / 1e6;
    out[design] = {
      jobs: stat.jobs,
      sendable: stat.sendable,
      sendableShare: +(stat.sendable / stat.jobs).toFixed(4),
      sendableLast20: 0,
      editsPerQuote: +(stat.edits / stat.jobs).toFixed(2),
      medianTotalError: +errs[Math.floor(errs.length / 2)].toFixed(4),
      p90TotalError: +errs[Math.floor(errs.length * 0.9)].toFixed(4),
      questionsAsked: stat.questions,
      officeMinutesPerQuote: +(stat.minutes / stat.jobs).toFixed(1),
      llmCostPerQuoteEur: +(cost / stat.jobs).toFixed(4),
      rulesPerPartner: +(stat.rules / world.partners.length).toFixed(1),
    };
    const last = byBucket.slice(-2).flat();
    out[design].sendableLast20 = +(last.reduce((a, b) => a + b, 0) / last.length).toFixed(4);
    curves[design] = byBucket.map((b) => +(b.reduce((a, x) => a + x, 0) / b.length).toFixed(4));
  }
  const n = world.jobs.length;
  const habits = Object.fromEntries(world.partners.map((p) => [p.id, { name: p.name, city: p.city, ...p.habits }]));
  const cat = new Map(world.partners[0].catalog.map((c) => [c.code, c]));
  const exFinal = world.truthQuote(exampleJob.id);
  const codes = [...new Set([...exampleProposed, ...exFinal, ...exampleLlm].map((l) => l.code))].sort();
  const exLines = codes.map((code) => {
    const a = exampleProposed.find((l) => l.code === code);
    const b = exFinal.find((l) => l.code === code);
    const m = exampleLlm.find((l) => l.code === code);
    const c = cat.get(code)!;
    return { code, name: c.name, unit: c.unit, llm: m?.qty ?? 0, proposed: a?.qty ?? 0, final: b?.qty ?? 0, unitPrice: c.price };
  });
  return {
    world: wc.name,
    volume: { partners: world.partners.length, jobs: n, withPlan: world.jobs.filter((j) => j.inputs.plan).length, questions, answered },
    designs: out,
    curves,
    bucket,
    fields: Object.fromEntries(FIELDS.map((f) => [f, { read: +(fields.read[f] / n).toFixed(4), settled: +(fields.settled[f] / n).toFixed(4) }])),
    familyWithGlossary: +(familyGlossary / n).toFixed(4),
    sources,
    ledger,
    learned,
    glossary: glossaries.gated ?? {},
    habits,
    example: {
      id: exampleJob.id,
      partner: world.partners[0].name,
      inputs: exampleJob.inputs,
      lines: exLines,
      proposedTotal: +total(exampleProposed).toFixed(2),
      finalTotal: +total(exFinal).toFixed(2),
      edits: edits(diff(exampleProposed, exFinal)),
      llmTotal: +total(exampleLlm).toFixed(2),
      llmEdits: edits(diff(exampleLlm, exFinal)),
      sendable: sendable(exampleProposed, exFinal, cfg.acceptance.sendableWithin),
    },
    manualMinutesPerQuote: pr.minutesManualQuote,
  };
}

function codeHash(): string {
  const h = createHash("sha256");
  const walk = (dir: string) => {
    for (const f of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const p = join(dir, f.name);
      if (f.isDirectory()) walk(p);
      else h.update(readFileSync(p));
    }
  };
  walk(join(ROOT, "src"));
  h.update(readFileSync(join(ROOT, "config", "engine.json")));
  return h.digest("hex").slice(0, 16);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const heldout = process.argv.includes("--heldout");
  const lock = join(ROOT, "config", "heldout.lock");
  if (heldout && existsSync(lock)) {
    console.error(`The held-out world was already run (${readFileSync(lock, "utf8").trim()}). Measure changes on the dev world.`);
    process.exit(1);
  }
  const r = evaluate(heldout ? "heldout" : "world");
  writeFileSync(join(ROOT, "reports", heldout ? "heldout.json" : "dev.json"), JSON.stringify(r, null, 1) + "\n");
  if (heldout) {
    let rev = "uncommitted";
    try {
      rev = execSync("git rev-parse --short HEAD", { cwd: ROOT }).toString().trim();
    } catch {}
    writeFileSync(lock, `commit ${rev} code ${codeHash()}\n`);
  }
  for (const [k, v] of Object.entries(r.designs)) console.log(k.padEnd(12), JSON.stringify(v));
}
