/**
 * Dimensions are not the model's job. An architect's plan is parsed by code; without one, a roofer's tape measurement
 * read from the voice note (to the centimetre, no "so ungefähr"); then a satellite footprint; a voice note that only
 * says "so ungefähr" is never priced from, it becomes a question to the customer.
 */
import type { Inputs, JobSpec } from "./types.js";

const num = (s: string) => Number(s.replace(",", "."));

export function parsePlan(plan: string | null): Partial<JobSpec> | null {
  if (!plan) return null;
  const dims = /Grundriss\s+([\d,.]+)\s*m\s*x\s*([\d,.]+)\s*m/i.exec(plan);
  const pitch = /Dachneigung\s+(\d+)\s*°/i.exec(plan);
  const storeys = /(\d)\s+Vollgeschoss/i.exec(plan);
  const out: Partial<JobSpec> = {};
  if (dims) {
    const [a, b] = [num(dims[1]), num(dims[2])];
    out.length = Math.max(a, b);
    out.width = Math.min(a, b);
  }
  if (pitch) out.pitch = Number(pitch[1]);
  if (storeys) out.storeys = Number(storeys[1]);
  if (/Walmdach/i.test(plan)) out.roof = "hip";
  else if (/Satteldach/i.test(plan)) out.roof = "gable";
  return out;
}

export function storeysFromPhotos(photos: string[]): number | null {
  for (const p of photos) {
    const m = /(\d)\s+Geschoss/.exec(p);
    if (m) return Number(m[1]);
  }
  return null;
}

export function skylightsFromPhotos(photos: string[]): number | null {
  for (const p of photos) {
    const m = /(\d+)\s+Dachfenster/.exec(p);
    if (m) return Number(m[1]);
  }
  return null;
}

/** The covering as the speaker named it ("neu mit Doppelmulden."), for the glossary. */
export function materialPhrase(voice: string): string | null {
  const m = /(?:neu mit|Eindeckung mit)\s+([^.]+)\./i.exec(voice);
  return m ? m[1].trim().toLowerCase() : null;
}

/** "14,09 mal 9,22 Meter" said on site is a tape measurement; "so ungefähr vierzehn mal neun" is not. */
export function tapeFromVoice(voice: string): { length: number; width: number } | null {
  if (/so ungefähr/i.test(voice)) return null;
  const m = /\b(\d+(?:,\d{1,2})?)\s+mal\s+(\d+(?:,\d{1,2})?)\s+Meter/.exec(voice);
  if (!m) return null;
  const [a, b] = [num(m[1]), num(m[2])];
  return { length: Math.max(a, b), width: Math.min(a, b) };
}

export type Measured = { spec: JobSpec; source: "plan" | "tape" | "satellite" | "voice" | "customer"; questions: string[] };

export type Lookups = {
  satellite: (jobId: string) => { length: number; width: number } | null;
  ask: (jobId: string, field: "length" | "width" | "storeys") => number | null;
};

/** Settle the spec: the model's reading, overruled field by field by better sources. */
export function settle(
  jobId: string,
  inputs: Inputs,
  read: JobSpec,
  look: Lookups,
  cfg: { askWhenOnlyVoice: boolean; tapeBeforeSatellite?: boolean },
  glossary: Record<string, JobSpec["family"]> = {},
): Measured {
  const spec = { ...read };
  const phrase = materialPhrase(inputs.voice);
  if (phrase && glossary[phrase]) spec.family = glossary[phrase];
  const fromCaption = skylightsFromPhotos(inputs.photos);
  if (fromCaption !== null && !/Dachfenster rein/.test(inputs.voice)) spec.skylights = fromCaption;
  const questions: string[] = [];
  let source: Measured["source"] = "voice";
  const plan = parsePlan(inputs.plan);
  if (plan) {
    Object.assign(spec, plan);
    source = "plan";
  } else {
    const tape = cfg.tapeBeforeSatellite ? tapeFromVoice(inputs.voice) : null;
    const sat = tape ? null : look.satellite(jobId);
    if (tape) {
      spec.length = tape.length;
      spec.width = tape.width;
      source = "tape";
    } else if (sat) {
      spec.length = Math.max(sat.length, sat.width);
      spec.width = Math.min(sat.length, sat.width);
      source = "satellite";
    } else if (/so ungefähr/.test(inputs.voice) && cfg.askWhenOnlyVoice) {
      questions.push("Können Sie uns die genauen Maße des Hauses (Länge und Breite) schicken?");
      const l = look.ask(jobId, "length");
      const w = look.ask(jobId, "width");
      if (l && w) {
        spec.length = l;
        spec.width = w;
        source = "customer";
      }
    }
  }
  const said = /Eingeschossig|Geschosse/.test(inputs.voice);
  if (!plan?.storeys && !said) {
    const fromPhotos = storeysFromPhotos(inputs.photos);
    if (fromPhotos) spec.storeys = fromPhotos;
  }
  return { spec, source, questions };
}
