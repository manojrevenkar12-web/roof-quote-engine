/** What the engine works with. The schemas are also the structured output the LLM must return. */
import { z } from "zod";

export const Family = z.enum(["frankfurter_pfanne", "biberschwanz", "betondachstein", "schiefer"]);
export const JobSpec = z.object({
  roof: z.enum(["gable", "hip"]),
  length: z.number().positive().describe("building length in metres, without overhang"),
  width: z.number().positive().describe("building width in metres, without overhang"),
  pitch: z.number().min(5).max(70).describe("roof pitch in degrees"),
  storeys: z.number().int().min(1).max(5),
  renovation: z.boolean(),
  family: Family.describe("the roof covering family"),
  insulationCm: z.number().int().min(0).max(30).describe("on-rafter insulation thickness, 0 if none"),
  skylights: z.number().int().min(0).max(10),
  chimneys: z.number().int().min(0).max(5),
  gutterOld: z.boolean().describe("existing gutters are rusted or leaking"),
});
export type JobSpec = z.infer<typeof JobSpec>;

export type Unit = "m2" | "lfm" | "Stk" | "psch";
export type Kind =
  | "covering" | "underlay" | "battens" | "insulation" | "scaffold" | "disposal" | "skylight"
  | "gutter" | "downpipe" | "ridge" | "hip" | "chimney" | "setup";
export type CatalogItem = { code: string; name: string; unit: Unit; price: number; kind: Kind; family?: string };
export type Line = { code: string; qty: number; unitPrice: number };
export type Inputs = { voice: string; photos: string[]; plan: string | null; address: string };

export const FEATURES = ["always", "renovation", "new_build", "storeys2", "storeys3", "gutterOld", "insulation", "hip"] as const;
export type Feature = (typeof FEATURES)[number];
export const OPTIONAL: Kind[] = ["underlay", "scaffold", "disposal", "gutter"];

export type Rule =
  | { type: "include"; kind: Kind; when: Feature; on: boolean }
  | { type: "waste"; value: number };
