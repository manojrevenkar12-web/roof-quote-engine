import type { ReactNode } from "react";
import { skeletonRows, skeletonStep } from "../app/theme";

export function Section({ id, title, lede, children }: { id: string; title: string; lede?: ReactNode; children: ReactNode }) {
  return (
    <section className="section" aria-labelledby={id}>
      <h2 id={id}>{title}</h2>
      {lede && <p className="lede">{lede}</p>}
      {children}
    </section>
  );
}

export function Skeleton({ rows = skeletonRows }: { rows?: number }) {
  return (
    <div className="state" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="skeleton" style={{ width: `${100 - i * skeletonStep}%` }} />
      ))}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="state" role="alert">
      <strong>The quote report did not load.</strong>
      <span className="muted">
        {message}. Run npx tsx scripts/readme.ts to write web/public/data/console.json, then retry.
      </span>
      <button className="button" onClick={onRetry}>
        Retry
      </button>
    </div>
  );
}

export const Empty = ({ children }: { children: ReactNode }) => <div className="state muted">{children}</div>;

export function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: Record<T, string>;
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="segmented" role="group" aria-label={label}>
      {(Object.keys(options) as T[]).map((k) => (
        <button key={k} aria-pressed={value === k} onClick={() => onChange(k)}>
          {options[k]}
        </button>
      ))}
    </div>
  );
}
