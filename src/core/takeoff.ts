/** Quantities from the settled spec: roof area from footprint, overhang and pitch; ridge, hips, gutters, downpipes and
 * scaffold from the same geometry. Plain arithmetic, so it is code, not a prompt. */
import type { JobSpec } from "./types.js";

const round = (x: number, d = 1) => Math.round(x * 10 ** d) / 10 ** d;

export function takeoff(s: JobSpec, overhang: number) {
  const L = s.length + 2 * overhang;
  const W = s.width + 2 * overhang;
  const rad = (s.pitch * Math.PI) / 180;
  const eavesHeight = s.storeys * 2.8 + 0.5;
  const rise = (s.width / 2) * Math.tan(rad);
  return {
    area: round((L * W) / Math.cos(rad)),
    ridge: round(s.roof === "gable" ? L : Math.max(s.length - s.width, 0)),
    hips: round(s.roof === "hip" ? 4 * Math.sqrt((s.width / 2) ** 2 * 2 + rise ** 2) : 0),
    gutter: round(s.roof === "gable" ? 2 * L : 2 * L + 2 * W),
    downpipe: round((s.roof === "gable" ? 2 : 4) * eavesHeight),
    scaffold: round(2 * (s.length + s.width) * eavesHeight),
  };
}
