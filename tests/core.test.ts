import { describe, expect, it } from "vitest";
import { glossaryEvidence, glossaryFrom } from "../src/core/learn.js";
import { materialPhrase, parsePlan, tapeFromVoice, settle } from "../src/core/measure.js";
import { buildQuote, includes, total } from "../src/core/quote.js";
import { diff, edits, sendable } from "../src/core/score.js";
import { takeoff } from "../src/core/takeoff.js";
import type { CatalogItem, JobSpec } from "../src/core/types.js";

const spec: JobSpec = { roof: "gable", length: 10, width: 8, pitch: 45, storeys: 2, renovation: true, family: "biberschwanz", insulationCm: 0, skylights: 1, chimneys: 1, gutterOld: false };
const defaults = { waste: 0.1, overhangM: 0.5, scaffoldMinStoreys: 2, disposalOnRenovation: true, underlayOnRenovation: true, guttersWhenOld: true };
const cat = (kind: CatalogItem["kind"], price: number, extra: Partial<CatalogItem> = {}): CatalogItem => ({ code: kind, name: kind, unit: "m2", price, kind, ...extra });
const catalog: CatalogItem[] = [
  cat("covering", 100, { family: "biberschwanz" }), cat("underlay", 10), cat("battens", 10), cat("scaffold", 10), cat("disposal", 20),
  cat("skylight", 1000), cat("gutter", 40), cat("downpipe", 40), cat("ridge", 40), cat("hip", 40), cat("chimney", 400), cat("setup", 500),
];

describe("measuring and pricing", () => {
  it("takes the roof area from footprint, overhang and pitch", () => {
    const q = takeoff(spec, 0.5);
    expect(q.area).toBeCloseTo((11 * 9) / Math.cos(Math.PI / 4), 0);
    expect(q.ridge).toBe(11);
    expect(q.hips).toBe(0);
    expect(takeoff({ ...spec, roof: "hip" }, 0.5).hips).toBeGreaterThan(0);
  });

  it("reads an architect's plan with code", () => {
    expect(parsePlan("Grundriss 10,40 m x 8,20 m, Dachneigung 38°, 2 Vollgeschosse, Walmdach")).toEqual({ length: 10.4, width: 8.2, pitch: 38, storeys: 2, roof: "hip" });
    expect(parsePlan(null)).toBeNull();
  });

  it("prefers the plan, then the satellite, and asks when only a rough voice size is left", () => {
    const inputs = { voice: "Satteldach, so ungefähr zehn mal acht Meter. Neu mit Biber.", photos: ["Foto 2: 2 Dachfenster", "Foto 9: Gesamtansicht, 2 Geschosse"], plan: null, address: "x" };
    const asked: string[] = [];
    const m = settle("J", inputs, { ...spec, length: 10, width: 8, skylights: 0, storeys: 1 }, { satellite: () => null, ask: (_id, f) => (asked.push(f), f === "length" ? 10.4 : 8.2) }, { askWhenOnlyVoice: true }, { biber: "schiefer" });
    expect(m.source).toBe("customer");
    expect(m.spec.length).toBe(10.4);
    expect(m.spec.skylights).toBe(2);
    expect(m.spec.storeys).toBe(2);
    expect(m.spec.family).toBe("schiefer");
    expect(m.questions).toHaveLength(1);
    const withPlan = settle("J", { ...inputs, plan: "Grundriss 12,00 m x 9,00 m, Dachneigung 30°" }, spec, { satellite: () => ({ length: 1, width: 1 }), ask: () => null }, { askWhenOnlyVoice: true });
    expect([withPlan.source, withPlan.spec.length, withPlan.spec.pitch]).toEqual(["plan", 12, 30]);
  });

  it("takes a tape measurement from the voice note before the satellite, never a rough one", () => {
    expect(tapeFromVoice("Also, Satteldach, 14,09 mal 9,22 Meter.")).toEqual({ length: 14.09, width: 9.22 });
    expect(tapeFromVoice("Also, Walmdach, 9,2 mal 14 Meter.")).toEqual({ length: 14, width: 9.2 });
    expect(tapeFromVoice("Also, Satteldach, so ungefähr vierzehn mal so ungefähr neun Meter.")).toBeNull();
    const look = { satellite: () => ({ length: 14.3, width: 9.1 }), ask: () => null };
    const voice = "Also, Satteldach, 14,09 mal 9,22 Meter. Neu mit Biber.";
    const inputs = { voice, photos: [], plan: null, address: "x" };
    const tape = settle("J", inputs, spec, look, { askWhenOnlyVoice: true, tapeBeforeSatellite: true });
    expect([tape.source, tape.spec.length, tape.spec.width]).toEqual(["tape", 14.09, 9.22]);
    expect(settle("J", inputs, spec, look, { askWhenOnlyVoice: true }).source).toBe("satellite");
    const plan = settle("J", { ...inputs, plan: "Grundriss 14,10 m x 9,20 m, Dachneigung 30°" }, spec, look, { askWhenOnlyVoice: true, tapeBeforeSatellite: true });
    expect(plan.source).toBe("plan");
  });

  it("applies the most specific learned rule, then the default", () => {
    expect(includes("scaffold", { ...spec, storeys: 1 }, defaults, [])).toBe(false);
    expect(includes("scaffold", { ...spec, storeys: 1 }, defaults, [{ type: "include", kind: "scaffold", when: "always", on: true }])).toBe(true);
    const rules = [{ type: "include" as const, kind: "underlay" as const, when: "always" as const, on: true }, { type: "include" as const, kind: "underlay" as const, when: "renovation" as const, on: false }];
    expect(includes("underlay", spec, defaults, rules)).toBe(false);
  });

  it("counts the edits a roofer makes and calls a quote sendable only without any", () => {
    const a = buildQuote(spec, catalog, defaults);
    const b = buildQuote({ ...spec, storeys: 1 }, catalog, defaults);
    const d = diff(a, b);
    expect(d.removed).toContain("scaffold");
    expect(edits(d)).toBeGreaterThan(0);
    expect(sendable(a, a, 0.03)).toBe(true);
    expect(sendable(a, b, 0.03)).toBe(false);
    expect(total(a)).toBeGreaterThan(total(b));
  });

  it("learns a trade word only once several sent quotes agree", () => {
    expect(materialPhrase("Altes Dach muss runter, neu mit Doppelmulden.")).toBe("doppelmulden");
    const ev = {};
    const pan = [cat("covering", 1, { code: "P", family: "frankfurter_pfanne" } as any)];
    const prop = [{ code: "B", qty: 1, unitPrice: 1 }];
    const fin = [{ code: "P", qty: 1, unitPrice: 1 }];
    glossaryEvidence(ev, "doppelmulden", prop, fin, [...pan, cat("covering", 1, { code: "B", family: "biberschwanz" } as any)]);
    expect(glossaryFrom(ev, 2)).toEqual({});
    glossaryEvidence(ev, "doppelmulden", prop, fin, [...pan, cat("covering", 1, { code: "B", family: "biberschwanz" } as any)]);
    expect(glossaryFrom(ev, 2)).toEqual({ doppelmulden: "frankfurter_pfanne" });
  });
});
