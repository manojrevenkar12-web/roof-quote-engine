/**
 * Roofers, their catalogs and habits, their jobs, and the truth about every one.
 *
 * Each roofer prices from their own catalog and has habits nobody wrote down: how much waste they add to the
 * covering, when they put up scaffolding, whether they replace the underlay on a renovation, whether they offer new
 * gutters when the old ones are rusted. For every job the world writes what arrives: a voice note from the site visit
 * (German, approximate, sometimes leaving things out), notes on the photos, and sometimes the architect's plan. It
 * also keeps satellite footprints, plays the customer who answers a question, plays the LLM that reads all of it, and
 * knows the quote the roofer would really send.
 *
 * Only scripts/evaluate.ts, scripts/export.ts and the tests import this module.
 */
import { createHash } from "node:crypto";

export type Unit = "m2" | "lfm" | "Stk" | "psch";
export type Kind =
  | "covering"
  | "underlay"
  | "battens"
  | "insulation"
  | "scaffold"
  | "disposal"
  | "skylight"
  | "gutter"
  | "downpipe"
  | "ridge"
  | "hip"
  | "chimney"
  | "setup";
export type Family = "frankfurter_pfanne" | "biberschwanz" | "betondachstein" | "schiefer";
export type Item = { code: string; name: string; unit: Unit; price: number; kind: Kind; family?: Family };

export type Habits = {
  waste: number;
  scaffold: "always" | "storeys2" | "never";
  disposal: boolean;
  underlay: boolean;
  gutters: boolean;
};
export type Partner = { id: string; name: string; city: string; catalog: Item[]; habits: Habits };

export type Spec = {
  roof: "gable" | "hip";
  length: number;
  width: number;
  pitch: number;
  storeys: number;
  renovation: boolean;
  family: Family;
  insulationCm: number;
  skylights: number;
  chimneys: number;
  gutterOld: boolean;
};
export type Line = { code: string; qty: number; unitPrice: number };
export type Inputs = { voice: string; photos: string[]; plan: string | null; address: string };
export type Job = { id: string; partner: string; seq: number; inputs: Inputs };

export const FAMILIES: Family[] = ["frankfurter_pfanne", "biberschwanz", "betondachstein", "schiefer"];
const SAY: Record<Family, { plain: string[]; slang: string[] }> = {
  frankfurter_pfanne: { plain: ["Frankfurter Pfanne", "Frankfurter Pfannen"], slang: ["die Braas-Pfanne", "Doppelmulden"] },
  biberschwanz: { plain: ["Biberschwanz", "Biberschwanzziegel"], slang: ["Biber", "Kronendeckung"] },
  betondachstein: { plain: ["Betondachsteine", "Betondachstein"], slang: ["Betonpfanne", "Harzer Pfanne"] },
  schiefer: { plain: ["Schiefer", "Naturschiefer"], slang: ["Altdeutsche Deckung", "Moselschiefer"] },
};
const CITIES = ["Potsdam", "Cottbus", "Magdeburg", "Leipzig", "Rostock", "Erfurt", "Dresden", "Halle", "Kiel", "Lübeck"];
const NAMES = ["Krüger", "Schulze", "Neumann", "Hartmann", "Lehmann", "Köhler", "Böhm", "Franke", "Albrecht", "Busch"];
const STREETS = ["Lindenweg", "Birkenstraße", "Am Anger", "Feldstraße", "Gartenweg", "Ahornallee", "Bergstraße"];
const NUM_DE = ["null", "eins", "zwei", "drei", "vier", "fünf", "sechs", "sieben", "acht", "neun", "zehn", "elf", "zwölf",
  "dreizehn", "vierzehn", "fünfzehn", "sechzehn", "siebzehn", "achtzehn", "neunzehn", "zwanzig"];

// ------------------------------------------------------------------------------------------ randomness

export function u(...keys: (string | number)[]): number {
  const h = createHash("sha256").update(keys.join("/")).digest();
  return h.readUInt32LE(0) / 2 ** 32;
}

class Rng {
  private n = 0;
  constructor(private readonly keys: (string | number)[]) {}
  next(): number {
    return u(...this.keys, this.n++);
  }
  int(lo: number, hi: number): number {
    return lo + Math.floor(this.next() * (hi - lo));
  }
  pick<T>(xs: readonly T[]): T {
    return xs[Math.floor(this.next() * xs.length)];
  }
  range(lo: number, hi: number): number {
    return lo + this.next() * (hi - lo);
  }
}

const round = (x: number, d = 2) => Math.round(x * 10 ** d) / 10 ** d;

// ------------------------------------------------------------------------------------------ geometry (the world's)

export function quantities(s: Spec, overhang = 0.5) {
  const L = s.length + 2 * overhang;
  const W = s.width + 2 * overhang;
  const rad = (s.pitch * Math.PI) / 180;
  const area = (L * W) / Math.cos(rad);
  const eavesHeight = s.storeys * 2.8 + 0.5;
  const rise = (s.width / 2) * Math.tan(rad);
  const ridge = s.roof === "gable" ? L : Math.max(s.length - s.width, 0);
  const hips = s.roof === "hip" ? 4 * Math.sqrt((s.width / 2) ** 2 * 2 + rise ** 2) : 0;
  const eaves = s.roof === "gable" ? 2 * L : 2 * L + 2 * W;
  return {
    area: round(area, 1),
    ridge: round(ridge, 1),
    hips: round(hips, 1),
    gutter: round(eaves, 1),
    downpipe: round((s.roof === "gable" ? 2 : 4) * eavesHeight, 1),
    scaffold: round(2 * (s.length + s.width) * eavesHeight, 1),
  };
}

// ------------------------------------------------------------------------------------------ the world

export type WorldConfig = Record<string, any>;

export class World {
  readonly partners: Partner[] = [];
  readonly jobs: Job[] = [];
  private truthSpec = new Map<string, Spec>();
  private sat = new Map<string, { length: number; width: number } | null>();
  readonly byId = new Map<string, Job>();
  readonly partnerById = new Map<string, Partner>();

  constructor(readonly cfg: WorldConfig) {
    for (let i = 0; i < cfg.partners; i++) this.partners.push(this.partner(i));
    for (const p of this.partners) {
      this.partnerById.set(p.id, p);
      for (let k = 0; k < cfg.jobsPerPartner; k++) this.job(p, k);
    }
    for (const j of this.jobs) this.byId.set(j.id, j);
  }

  private partner(i: number): Partner {
    const r = new Rng([this.cfg.seed, "partner", i]);
    const name = `Dachdeckerei ${NAMES[i % NAMES.length]}`;
    const f = () => r.range(0.85, 1.18);
    const catalog: Item[] = [];
    const prefix = String.fromCharCode(65 + i);
    let n = 100;
    const add = (name: string, unit: Unit, price: number, kind: Kind, family?: Family) =>
      catalog.push({ code: `${prefix}-${n++}`, name, unit, price: round(price * f()), kind, family });
    add("Frankfurter Pfanne engobiert, inkl. Verlegung", "m2", 68, "covering", "frankfurter_pfanne");
    add("Biberschwanz Rundschnitt, Doppeldeckung, inkl. Verlegung", "m2", 96, "covering", "biberschwanz");
    add("Betondachstein, inkl. Verlegung", "m2", 52, "covering", "betondachstein");
    add("Naturschiefer Altdeutsch, inkl. Verlegung", "m2", 165, "covering", "schiefer");
    add("Unterspannbahn diffusionsoffen", "m2", 9.5, "underlay");
    add("Konter- und Dachlattung", "m2", 14, "battens");
    add("Aufsparrendämmung 14 cm", "m2", 58, "insulation");
    add("Aufsparrendämmung 18 cm", "m2", 71, "insulation");
    add("Fassadengerüst inkl. Auf- und Abbau", "m2", 11, "scaffold");
    add("Altdach abdecken und entsorgen", "m2", 22, "disposal");
    add("Dachfenster 78x118 inkl. Eindeckrahmen", "Stk", 1150, "skylight");
    add("Hängerinne Zink, halbrund", "lfm", 48, "gutter");
    add("Fallrohr Zink DN 100", "lfm", 39, "downpipe");
    add("First mit Lüfterelement", "lfm", 42, "ridge");
    add("Grat trocken verlegt", "lfm", 46, "hip");
    add("Kaminanschluss Blei", "Stk", 480, "chimney");
    add("Baustelleneinrichtung", "psch", 650, "setup");
    const habits: Habits = {
      waste: round(r.pick([0.05, 0.07, 0.08, 0.1, 0.12]), 2),
      scaffold: r.pick(["always", "storeys2", "storeys2", "never"] as const),
      disposal: r.next() < 0.85,
      underlay: r.next() < 0.6,
      gutters: r.next() < 0.6,
    };
    return { id: `P${i + 1}`, name, city: r.pick(CITIES), catalog, habits };
  }

  private job(p: Partner, k: number): void {
    const c = this.cfg;
    const r = new Rng([c.seed, "job", p.id, k]);
    const id = `${p.id}-J${String(k + 1).padStart(3, "0")}`;
    const renovation = r.next() < c.renovationShare;
    const spec: Spec = {
      roof: r.next() < c.hipShare ? "hip" : "gable",
      length: round(r.range(8, 16), 2),
      width: round(r.range(6, 11), 2),
      pitch: r.int(22, 50),
      storeys: r.pick([1, 2, 2, 3]),
      renovation,
      family: r.pick(FAMILIES),
      insulationCm: renovation && r.next() < 0.4 ? r.pick([14, 18]) : 0,
      skylights: r.pick([0, 0, 1, 1, 2, 3]),
      chimneys: r.pick([0, 1, 1, 2]),
      gutterOld: renovation && r.next() < 0.5,
    };
    if (spec.width > spec.length) [spec.width, spec.length] = [spec.length, spec.width];
    this.truthSpec.set(id, spec);
    const address = `${r.pick(STREETS)} ${r.int(1, 90)}, ${p.city}`;
    this.sat.set(id, r.next() < c.satelliteShare
      ? { length: round(spec.length * (1 + (r.next() - 0.5) * 2 * c.satelliteError), 2), width: round(spec.width * (1 + (r.next() - 0.5) * 2 * c.satelliteError), 2) }
      : null);
    // what arrives
    const approx = r.next() < c.voiceApproximate;
    const dim = (x: number) => (approx ? `so ungefähr ${NUM_DE[Math.round(x)] ?? Math.round(x)}` : `${String(x).replace(".", ",")}`);
    const fam = r.next() < c.slangShare ? r.pick(SAY[spec.family].slang) : r.pick(SAY[spec.family].plain);
    const parts = [
      `Also, ${spec.roof === "gable" ? "Satteldach" : "Walmdach"}, ${dim(spec.length)} mal ${dim(spec.width)} Meter.`,
      `Neigung ${approx ? "so um die " : ""}${spec.pitch} Grad.`,
    ];
    if (r.next() >= c.storeysOmittedInVoice) parts.push(`${["", "Eingeschossig", "Zwei Geschosse", "Drei Geschosse"][spec.storeys]}.`);
    parts.push(spec.renovation ? `Altes Dach muss runter, neu mit ${fam}.` : `Neubau, Eindeckung mit ${fam}.`);
    if (spec.insulationCm) parts.push(`Kunde will gleich dämmen, ${spec.insulationCm} Zentimeter Aufsparren.`);
    const photos: string[] = [];
    const photoOnly = spec.skylights > 0 && r.next() < c.skylightsOnlyInPhotos;
    if (spec.skylights > 0 && !photoOnly) parts.push(`${spec.skylights === 1 ? "Ein Dachfenster" : `${NUM_DE[spec.skylights]} Dachfenster`} rein.`);
    if (photoOnly) photos.push(`Foto ${r.int(1, 4)}: Dachfläche Süd, ${spec.skylights} ${spec.skylights === 1 ? "Dachfenster" : "Dachfenster"} eingezeichnet`);
    if (spec.chimneys) photos.push(`Foto ${r.int(4, 7)}: ${spec.chimneys === 1 ? "ein Schornstein" : `${spec.chimneys} Schornsteine`}, Anschluss alt`);
    if (spec.gutterOld) {
      photos.push(`Foto ${r.int(7, 9)}: Rinne verrostet, teilweise undicht`);
      if (r.next() < 0.4) parts.push("Rinnen sind auch durch.");
    }
    photos.push(`Foto ${r.int(9, 12)}: Gesamtansicht, ${spec.storeys} Geschoss${spec.storeys > 1 ? "e" : ""}`);
    const plan =
      r.next() < c.planShare
        ? `Grundriss ${String(spec.length.toFixed(2)).replace(".", ",")} m x ${String(spec.width.toFixed(2)).replace(".", ",")} m, Dachneigung ${spec.pitch}°, ${spec.storeys} Vollgeschoss${spec.storeys > 1 ? "e" : ""}, ${spec.roof === "gable" ? "Satteldach" : "Walmdach"}`
        : null;
    this.jobs.push({ id, partner: p.id, seq: k, inputs: { voice: parts.join(" "), photos, plan, address } });
  }

  // ------------------------------------------------------------------------------------------ services

  satellite(jobId: string): { length: number; width: number } | null {
    return this.sat.get(jobId) ?? null;
  }

  /** The customer answers a measurement question (or does not). */
  answer(jobId: string, field: "length" | "width" | "storeys"): number | null {
    if (u(this.cfg.seed, "answer", jobId, field) >= this.cfg.customer.answersQuestion) return null;
    return this.truthSpec.get(jobId)![field];
  }

  spec(jobId: string): Spec {
    return { ...this.truthSpec.get(jobId)! };
  }

  /** The quote the roofer would send: their catalog, their habits. */
  truthQuote(jobId: string): Line[] {
    const job = this.byId.get(jobId)!;
    const p = this.partnerById.get(job.partner)!;
    const s = this.truthSpec.get(jobId)!;
    const q = quantities(s);
    const h = p.habits;
    const item = (kind: Kind, pred: (i: Item) => boolean = () => true) => p.catalog.find((i) => i.kind === kind && pred(i))!;
    const lines: Line[] = [];
    const add = (i: Item, qty: number) => qty > 0 && lines.push({ code: i.code, qty: round(qty, 1), unitPrice: i.price });
    const covered = q.area * (1 + h.waste);
    add(item("covering", (i) => i.family === s.family), covered);
    if (!s.renovation || h.underlay) add(item("underlay"), covered);
    add(item("battens"), q.area);
    if (s.insulationCm) add(item("insulation", (i) => i.name.includes(`${s.insulationCm} cm`)), q.area);
    if (h.scaffold === "always" || (h.scaffold === "storeys2" && s.storeys >= 2)) add(item("scaffold"), q.scaffold);
    if (s.renovation && h.disposal) add(item("disposal"), q.area);
    add(item("skylight"), s.skylights);
    if (!s.renovation || (s.gutterOld && h.gutters)) {
      add(item("gutter"), q.gutter);
      add(item("downpipe"), q.downpipe);
    }
    add(item("ridge"), q.ridge);
    add(item("hip"), q.hips);
    add(item("chimney"), s.chimneys);
    add(item("setup"), 1);
    return lines;
  }

  // ------------------------------------------------------------------------------------------ the LLM

  /** What the model extracts from the voice note, photo notes and plan. Draws are keyed by job and mistake, never by
   * design, so every design reads the same job the same way. */
  extract(jobId: string): Partial<Spec> & { lengthFrom: "plan" | "voice"; } {
    const g = this.cfg.llm;
    const s = this.truthSpec.get(jobId)!;
    const job = this.byId.get(jobId)!;
    const d = (k: string) => u(this.cfg.seed, "llm", jobId, k);
    const voiceDims = /so ungefähr/.test(job.inputs.voice);
    const out: Partial<Spec> & { lengthFrom: "plan" | "voice" } = { ...s, lengthFrom: job.inputs.plan ? "plan" : "voice" };
    if (voiceDims && (!job.inputs.plan || d("prefers_voice") < g.prefersVoiceOverPlan)) {
      out.length = Math.round(s.length);
      out.width = Math.round(s.width);
      out.lengthFrom = "voice";
    }
    const photoOnly = s.skylights > 0 && !/Dachfenster rein/.test(job.inputs.voice);
    if (photoOnly && d("photo_skylights") < g.missesPhotoOnlySkylights) out.skylights = 0;
    const slang = Object.values(SAY).some((v) => v.slang.some((w) => job.inputs.voice.includes(w)));
    if (slang && d("slang") < g.slangMisread) out.family = FAMILIES[(FAMILIES.indexOf(s.family) + 1 + Math.floor(d("slang_to") * 3)) % 4];
    if (d("pitch") < g.pitchMisheard) out.pitch = s.pitch - 10;
    const storeysSaid = /Eingeschossig|Geschosse/.test(job.inputs.voice);
    if (!storeysSaid && !job.inputs.plan && d("storeys") < g.assumesOneStorey) out.storeys = 1;
    for (const f of ["chimneys", "insulationCm", "gutterOld"] as const) {
      if (d(`noise_${f}`) < g.noise) (out as any)[f] = f === "gutterOld" ? !s.gutterOld : f === "chimneys" ? (s.chimneys + 1) % 3 : s.insulationCm ? 0 : 14;
    }
    return out;
  }

  /** A whole quote written by the model from the inputs and the catalog in its context. */
  llmQuote(jobId: string, spec: Spec): Line[] {
    const g = this.cfg.llm;
    const p = this.partnerById.get(this.byId.get(jobId)!.partner)!;
    const d = (k: string) => u(this.cfg.seed, "llmquote", jobId, k);
    const q = quantities(spec);
    const slip = d("area") < g.quoteArithmeticSlip ? 1 + (d("area_by") < 0.5 ? -1 : 1) * (0.05 + d("area_mag") * 0.1) : 1;
    const area = q.area * slip;
    const item = (kind: Kind, pred: (i: Item) => boolean = () => true) => {
      const right = p.catalog.find((i) => i.kind === kind && pred(i))!;
      if (d(`item_${kind}`) < g.quoteWrongItem) {
        const same = p.catalog.filter((i) => i.kind === kind && i !== right);
        if (same.length) return same[0];
      }
      return right;
    };
    const lines: Line[] = [];
    const add = (i: Item, qty: number) => {
      if (qty <= 0) return;
      const price = d(`price_${i.code}`) < g.quoteWrongPrice ? round(i.price * 1.15) : i.price;
      lines.push({ code: i.code, qty: round(qty, 1), unitPrice: price });
    };
    add(item("covering", (i) => i.family === spec.family), area * 1.1);
    add(item("underlay"), area * 1.1);
    add(item("battens"), area);
    if (spec.insulationCm) add(item("insulation", (i) => i.name.includes(`${spec.insulationCm} cm`)), area);
    if (spec.storeys >= 2) add(item("scaffold"), q.scaffold * slip);
    if (spec.renovation) add(item("disposal"), area);
    add(item("skylight"), spec.skylights);
    add(item("gutter"), q.gutter);
    add(item("downpipe"), q.downpipe);
    add(item("ridge"), q.ridge);
    add(item("hip"), q.hips);
    add(item("chimney"), spec.chimneys);
    add(item("setup"), 1);
    return lines;
  }
}
