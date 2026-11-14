import { pct } from "../../app/theme";
import type { Run } from "../../shared/types";

const LABEL: Record<string, string> = {
  length: "Roof length",
  width: "Roof width",
  pitch: "Pitch",
  storeys: "Storeys",
  family: "Covering",
  skylights: "Skylights",
  chimneys: "Chimneys",
  renovation: "Renovation or new build",
};

export function Fields({ run }: { run: Run }) {
  const rows = Object.entries(run.fields).map(([k, v]) => (k === "family" ? [k, { ...v, settled: run.familyWithGlossary }] as const : ([k, v] as const)));
  return (
    <table className="plain fields">
      <thead>
        <tr>
          <th scope="col">Field</th>
          <th scope="col">Right as the model read it</th>
          <th scope="col">Right after code settled it</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(([k, v]) => (
          <tr key={k}>
            <th scope="row">{LABEL[k] ?? k}</th>
            <td>
              <span className="meter" style={{ ["--v" as string]: v.read }} />
              {pct(v.read)}
            </td>
            <td>
              <span className="meter good" style={{ ["--v" as string]: v.settled }} />
              {pct(v.settled)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
