/** Numbers the components use. Colours and spacing live in tokens.css. */
export const motion = {
  rise: { duration: 0.5, ease: [0.25, 0.1, 0.25, 1] as const },
  swap: { duration: 0.18 },
  stagger: 0.04,
};
export const order = ["llm_quote", "spec_code", "naive_rules", "gated_rules"] as const;
export const designVar: Record<string, string> = { llm_quote: "--oxide", spec_code: "--zinc", naive_rules: "--ochre", gated_rules: "--patina" };
export const skeletonRows = 4;
export const skeletonStep = 12;
export const pct = (x: number, d = 1) => `${(x * 100).toFixed(d)}%`;
export const eur = (x: number) => x.toLocaleString("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
export const qty = (x: number) => x.toLocaleString("de-DE", { maximumFractionDigits: 1 });
