/**
 * Learning a roofer's habits from their edits.
 *
 * Every sent quote is compared with what the engine proposed. An added or removed scaffold, disposal, underlay or
 * gutter line, or a covering quantity they always change, is evidence of a habit.
 *
 * - naive: the last edit becomes a rule at once ("they added scaffolding, so always add scaffolding").
 * - gated: a candidate rule ("add scaffolding when the house has two storeys or more") must make the roofer's own past
 *   quotes need fewer edits than it adds when they are rebuilt with it (a one-sided sign test), with support from
 *   several jobs. The condition is chosen by that replay, not guessed.
 */
import { buildQuote, type Defaults } from "./quote.js";
import { diff, edits } from "./score.js";
import { FEATURES, OPTIONAL, type CatalogItem, type JobSpec, type Kind, type Line, type Rule } from "./types.js";

export type History = { jobId: string; spec: JobSpec; final: Line[] }[];
export type Decision = { seq: number; rule: Rule; decision: "added" | "replaced" | "rejected"; why: string };

function binomUpper(k: number, n: number): number {
  // P(X >= k) for X ~ Bin(n, 0.5)
  let p = 0;
  let c = 1;
  for (let i = 0; i <= n; i++) {
    if (i > 0) c = (c * (n - i + 1)) / i;
    if (i >= k) p += c;
  }
  return p / 2 ** n;
}

export function replay(history: History, catalog: CatalogItem[], d: Defaults, before: Rule[], after: Rule[]) {
  let fixed = 0;
  let broken = 0;
  for (const h of history) {
    const a = edits(diff(buildQuote(h.spec, catalog, d, before), h.final));
    const b = edits(diff(buildQuote(h.spec, catalog, d, after), h.final));
    if (b < a) fixed++;
    if (b > a) broken++;
  }
  return { fixed, broken, p: fixed + broken ? binomUpper(fixed, fixed + broken) : 1 };
}

const kindOf = (code: string, catalog: CatalogItem[]) => catalog.find((i) => i.code === code)?.kind;

/** The edits one sent quote shows: kinds added or removed, and the implied waste on the covering. */
export function evidence(proposed: Line[], final: Line[], catalog: CatalogItem[], wasteUsed: number) {
  const d = diff(proposed, final);
  const added = d.added.map((c) => kindOf(c, catalog)).filter((k): k is Kind => !!k && OPTIONAL.includes(k));
  const removed = d.removed.map((c) => kindOf(c, catalog)).filter((k): k is Kind => !!k && OPTIONAL.includes(k));
  const cov = proposed.find((l) => kindOf(l.code, catalog) === "covering");
  const fcov = final.find((l) => kindOf(l.code, catalog) === "covering");
  const waste = cov && fcov && cov.code === fcov.code ? Math.round(((fcov.qty / cov.qty) * (1 + wasteUsed) - 1) * 100) / 100 : null;
  return { added, removed, waste };
}

export function naive(rules: Rule[], ev: ReturnType<typeof evidence>): Rule[] {
  let out = [...rules];
  for (const k of ev.added) out = [...out.filter((r) => !(r.type === "include" && r.kind === k)), { type: "include", kind: k, when: "always", on: true }];
  for (const k of ev.removed) out = [...out.filter((r) => !(r.type === "include" && r.kind === k)), { type: "include", kind: k, when: "always", on: false }];
  if (ev.waste !== null && Math.abs(ev.waste - (out.find((r) => r.type === "waste") as any)?.value) > 0.005) {
    out = [...out.filter((r) => r.type !== "waste"), { type: "waste", value: ev.waste }];
  }
  return out;
}

export function gated(
  rules: Rule[],
  history: History,
  catalog: CatalogItem[],
  d: Defaults,
  cfg: { minSupport: number; minNetFixed: number; maxP: number; replayLast: number },
  wastes: number[],
  seq: number,
): { rules: Rule[]; log: Decision[] } {
  const recent = history.slice(-cfg.replayLast);
  const log: Decision[] = [];
  let current = [...rules];
  if (recent.length < cfg.minSupport) return { rules: current, log };
  // inclusion habits: try every kind, both directions, every condition; keep the best that passes the replay
  for (const kind of OPTIONAL) {
    let best: { rule: Rule; fixed: number; broken: number; p: number } | null = null;
    for (const when of FEATURES) {
      for (const on of [true, false]) {
        const rule: Rule = { type: "include", kind, when, on };
        const trial = [...current.filter((r) => !(r.type === "include" && r.kind === kind)), rule];
        const r = replay(recent, catalog, d, current, trial);
        if (r.fixed - r.broken >= cfg.minNetFixed && r.fixed >= cfg.minSupport && r.p <= cfg.maxP && (!best || r.fixed - r.broken > best.fixed - best.broken)) {
          best = { rule, ...r };
        }
      }
    }
    if (best) {
      const had = current.some((r) => r.type === "include" && r.kind === kind);
      current = [...current.filter((r) => !(r.type === "include" && r.kind === kind)), best.rule];
      log.push({ seq, rule: best.rule, decision: had ? "replaced" : "added", why: `replayed on ${recent.length} past quotes: ${best.fixed} need fewer edits, ${best.broken} more (p=${best.p.toFixed(3)})` });
    }
  }
  // waste: the median of what the roofer's edits imply, kept only if the replay agrees
  const ws = wastes.slice(-cfg.replayLast);
  if (ws.length >= cfg.minSupport) {
    const sorted = [...ws].sort((a, b) => a - b);
    const value = sorted[Math.floor(sorted.length / 2)];
    const cur = current.find((r) => r.type === "waste") as Extract<Rule, { type: "waste" }> | undefined;
    if (!cur || Math.abs(cur.value - value) > 0.005) {
      const rule: Rule = { type: "waste", value };
      const trial = [...current.filter((r) => r.type !== "waste"), rule];
      const r = replay(recent, catalog, d, current, trial);
      if (r.fixed - r.broken >= cfg.minNetFixed && r.p <= cfg.maxP) {
        current = trial;
        log.push({ seq, rule, decision: cur ? "replaced" : "added", why: `median of ${ws.length} covering edits; replay: ${r.fixed} fixed, ${r.broken} broken (p=${r.p.toFixed(3)})` });
      }
    }
  }
  return { rules: current, log };
}

/**
 * The trade's own words for coverings ("Doppelmulden", "Biber", "Harzer Pfanne"). When a roofer swaps the covering
 * line, the phrase the voice note used is evidence for what it means. A phrase enters the glossary once enough sent
 * quotes agree and none disagree (gated), or at the first swap (naive).
 */
export type GlossaryEvidence = Record<string, Record<string, number>>;

export function glossaryEvidence(ev: GlossaryEvidence, phrase: string | null, proposed: Line[], final: Line[], catalog: CatalogItem[]) {
  if (!phrase) return;
  const fam = (lines: Line[]) => catalog.find((i) => i.kind === "covering" && lines.some((l) => l.code === i.code))?.family;
  const said = fam(final);
  if (!said) return;
  if (fam(proposed) !== said || ev[phrase]) {
    ev[phrase] ??= {};
    ev[phrase][said] = (ev[phrase][said] ?? 0) + 1;
  }
}

export function glossaryFrom(ev: GlossaryEvidence, minSupport: number): Record<string, JobSpec["family"]> {
  const out: Record<string, JobSpec["family"]> = {};
  for (const [phrase, counts] of Object.entries(ev)) {
    const entries = Object.entries(counts);
    if (entries.length === 1 && entries[0][1] >= minSupport) out[phrase] = entries[0][0] as JobSpec["family"];
  }
  return out;
}
