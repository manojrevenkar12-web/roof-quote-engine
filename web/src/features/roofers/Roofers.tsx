import { useState } from "react";
import type { Rule, Run } from "../../shared/types";
import { Empty } from "../../shared/ui";

export const ruleText = (r: Rule) =>
  r.type === "waste" ? `waste on the covering ${Math.round(r.value * 100)}%` : `${r.on ? "include" : "leave out"} ${r.kind}${r.when === "always" ? "" : ` when ${r.when}`}`;

export function Roofers({ run }: { run: Run }) {
  const ids = Object.keys(run.habits);
  const [open, setOpen] = useState<string | null>(null);
  if (!ids.length) return <Empty>No roofers in this report.</Empty>;
  return (
    <div className="roofers">
      <table className="plain">
        <thead>
          <tr>
            <th scope="col">Roofer</th>
            <th scope="col">How they really quote</th>
            <th scope="col">Rules the engine kept</th>
          </tr>
        </thead>
        <tbody>
          {ids.map((id) => {
            const h = run.habits[id];
            const rules = run.learned[id] ?? [];
            return (
              <tr key={id}>
                <th scope="row">
                  {h.name} <span className="muted">{h.city}</span>
                </th>
                <td className="muted">
                  {Math.round(h.waste * 100)}% waste, scaffolding {h.scaffold === "storeys2" ? "from two storeys" : h.scaffold}, {h.underlay ? "new underlay" : "keeps the underlay"} on a renovation,{" "}
                  {h.gutters ? "offers" : "skips"} new gutters
                </td>
                <td>
                  {rules.length ? (
                    <button className="rules" aria-expanded={open === id} onClick={() => setOpen(open === id ? null : id)}>
                      {rules.map(ruleText).join("; ")}
                    </button>
                  ) : (
                    <span className="muted">the defaults already fit</span>
                  )}
                  {open === id && (
                    <ul className="why">
                      {(run.ledger[id] ?? []).map((l, i) => (
                        <li key={i}>
                          After job {l.seq + 1}: {ruleText(l.rule)}. {l.why}.
                        </li>
                      ))}
                    </ul>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="note">
        Trade words learned across roofers:{" "}
        {Object.entries(run.glossary)
          .map(([k, v]) => `"${k}" means ${v.replace("_", " ")}`)
          .join(", ")}
        .
      </p>
    </div>
  );
}
