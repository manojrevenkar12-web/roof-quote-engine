/** How far a proposed quote is from the one the roofer sent: the edits they had to make, and the total. */
import { total } from "./quote.js";
import type { Line } from "./types.js";

export type Diff = { added: string[]; removed: string[]; changed: { code: string; from: number; to: number }[]; priceChanged: string[] };

export function diff(proposed: Line[], final: Line[], tolerance = 0.03): Diff {
  const p = new Map(proposed.map((l) => [l.code, l]));
  const f = new Map(final.map((l) => [l.code, l]));
  const out: Diff = { added: [], removed: [], changed: [], priceChanged: [] };
  for (const [code, l] of f) {
    const a = p.get(code);
    if (!a) out.added.push(code);
    else {
      if (Math.abs(a.qty - l.qty) > tolerance * Math.max(l.qty, 1)) out.changed.push({ code, from: a.qty, to: l.qty });
      if (Math.abs(a.unitPrice - l.unitPrice) > 0.005) out.priceChanged.push(code);
    }
  }
  for (const code of p.keys()) if (!f.has(code)) out.removed.push(code);
  return out;
}

export const edits = (d: Diff) => d.added.length + d.removed.length + d.changed.length + d.priceChanged.length;

export function sendable(proposed: Line[], final: Line[], within: number): boolean {
  const t = total(final);
  return edits(diff(proposed, final, within)) === 0 && Math.abs(total(proposed) - t) <= within * t;
}

export const totalError = (proposed: Line[], final: Line[]) => Math.abs(total(proposed) - total(final)) / total(final);
