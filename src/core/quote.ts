/** A quote from the settled spec and the roofer's own catalog, with their learned rules on top of the defaults. */
import { takeoff } from "./takeoff.js";
import type { CatalogItem, Feature, JobSpec, Kind, Line, Rule } from "./types.js";

export type Defaults = {
  waste: number;
  overhangM: number;
  scaffoldMinStoreys: number;
  disposalOnRenovation: boolean;
  underlayOnRenovation: boolean;
  guttersWhenOld: boolean;
};

export function holds(f: Feature, s: JobSpec): boolean {
  switch (f) {
    case "always": return true;
    case "renovation": return s.renovation;
    case "new_build": return !s.renovation;
    case "storeys2": return s.storeys >= 2;
    case "storeys3": return s.storeys >= 3;
    case "gutterOld": return s.gutterOld;
    case "insulation": return s.insulationCm > 0;
    case "hip": return s.roof === "hip";
  }
}

function byDefault(kind: Kind, s: JobSpec, d: Defaults): boolean {
  if (kind === "underlay") return !s.renovation || d.underlayOnRenovation;
  if (kind === "scaffold") return s.storeys >= d.scaffoldMinStoreys;
  if (kind === "disposal") return s.renovation && d.disposalOnRenovation;
  if (kind === "gutter") return !s.renovation || (s.gutterOld && d.guttersWhenOld);
  return true;
}

/** Does this quote include an optional kind? The most specific applicable rule wins, then the default. */
export function includes(kind: Kind, s: JobSpec, d: Defaults, rules: Rule[]): boolean {
  const applicable = rules.filter((r): r is Extract<Rule, { type: "include" }> => r.type === "include" && r.kind === kind && holds(r.when, s));
  if (!applicable.length) return byDefault(kind, s, d);
  const specific = applicable.find((r) => r.when !== "always") ?? applicable[0];
  return specific.on;
}

export function wasteOf(d: Defaults, rules: Rule[]): number {
  const w = rules.find((r): r is Extract<Rule, { type: "waste" }> => r.type === "waste");
  return w ? w.value : d.waste;
}

export function buildQuote(s: JobSpec, catalog: CatalogItem[], d: Defaults, rules: Rule[] = []): Line[] {
  const q = takeoff(s, d.overhangM);
  const waste = wasteOf(d, rules);
  const pick = (kind: Kind, pred: (i: CatalogItem) => boolean = () => true) => catalog.find((i) => i.kind === kind && pred(i));
  const lines: Line[] = [];
  const add = (i: CatalogItem | undefined, qty: number) => {
    if (i && qty > 0) lines.push({ code: i.code, qty: Math.round(qty * 10) / 10, unitPrice: i.price });
  };
  const covered = q.area * (1 + waste);
  add(pick("covering", (i) => i.family === s.family), covered);
  if (includes("underlay", s, d, rules)) add(pick("underlay"), covered);
  add(pick("battens"), q.area);
  if (s.insulationCm) add(pick("insulation", (i) => i.name.includes(`${s.insulationCm} cm`)), q.area);
  if (includes("scaffold", s, d, rules)) add(pick("scaffold"), q.scaffold);
  if (includes("disposal", s, d, rules)) add(pick("disposal"), q.area);
  add(pick("skylight"), s.skylights);
  if (includes("gutter", s, d, rules)) {
    add(pick("gutter"), q.gutter);
    add(pick("downpipe"), q.downpipe);
  }
  add(pick("ridge"), q.ridge);
  add(pick("hip"), q.hips);
  add(pick("chimney"), s.chimneys);
  add(pick("setup"), 1);
  return lines;
}

export const total = (lines: Line[]) => Math.round(lines.reduce((a, l) => a + l.qty * l.unitPrice, 0) * 100) / 100;
