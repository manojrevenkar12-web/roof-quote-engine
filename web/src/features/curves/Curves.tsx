import { motion } from "framer-motion";
import { designVar, motion as m, order, pct } from "../../app/theme";
import type { Run } from "../../shared/types";

export function Curves({ run, names }: { run: Run; names: Record<string, string> }) {
  const keys = order.filter((k) => run.curves[k]);
  const buckets = run.curves[keys[0]]?.length ?? 0;
  return (
    <div className="curves">
      <div className="legend">
        {keys.map((k) => (
          <span key={k}>
            <i style={{ background: `var(${designVar[k]})` }} aria-hidden="true" />
            {names[k]}: <b>{pct(run.designs[k].sendableLast20, 0)}</b> in the last 20 jobs
          </span>
        ))}
      </div>
      <div className="groups">
        {Array.from({ length: buckets }, (_, b) => (
          <div className="group" key={b} role="group" aria-label={`Jobs ${b * run.bucket + 1} to ${(b + 1) * run.bucket}`}>
            <div className="bars">
              {keys.map((k, i) => (
                <motion.i
                  key={k}
                  aria-label={`${names[k]}: ${pct(run.curves[k][b], 0)}`}
                  style={{ background: `var(${designVar[k]})` }}
                  initial={{ height: 0 }}
                  animate={{ height: `${run.curves[k][b] * 100}%` }}
                  transition={{ ...m.rise, delay: (b * keys.length + i) * m.stagger }}
                />
              ))}
            </div>
            <span className="group-label">
              Jobs {b * run.bucket + 1}–{(b + 1) * run.bucket}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
