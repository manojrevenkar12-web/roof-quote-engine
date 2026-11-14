import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";
import { Curves } from "../features/curves/Curves";
import { Fields } from "../features/fields/Fields";
import { JobToQuote } from "../features/job/JobToQuote";
import { Roofers } from "../features/roofers/Roofers";
import { useConsole } from "../shared/api";
import type { Console, Run } from "../shared/types";
import { Empty, ErrorState, Section, Segmented, Skeleton } from "../shared/ui";
import { motion as m, pct } from "./theme";

type Which = "dev" | "heldout";

export function headline(run: Run): string {
  const g = run.designs.gated_rules;
  const l = run.designs.llm_quote;
  return `${pct(g.sendableLast20, 0)} of quotes go out without a single edit. ${pct(l.sendableLast20, 0)} when the model writes the whole quote.`;
}

function Desk({ run, data }: { run: Run; data: Console }) {
  if (!run.designs.gated_rules || !Object.keys(run.curves).length) return <Empty>This report has no designs. Run npx tsx scripts/evaluate.ts, then npx tsx scripts/readme.ts.</Empty>;
  const g = run.designs.gated_rules;
  return (
    <>
      <div className="hero">
        <AnimatePresence mode="wait" initial={false}>
          <motion.h1 key={run.world} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={m.swap}>
            {headline(run)}
          </motion.h1>
        </AnimatePresence>
        <p className="lede">
          {run.volume.jobs} jobs from {run.volume.partners} roofers, each with their own catalog and habits. The model reads the voice note and photos, code measures and
          prices, and each roofer's edits become rules only when their past quotes agree: {g.editsPerQuote.toFixed(2)} edits per quote, {g.officeMinutesPerQuote.toFixed(1)} office
          minutes.
        </p>
      </div>
      <Section id="job" title="One job, from voice note to quote">
        <JobToQuote run={run} />
      </Section>
      <Section
        id="fields"
        title="What the model reads, and what code settles"
        lede="A plan beats the satellite, the satellite beats the voice note, and the customer is asked only when nothing else measured the roof. Storeys and skylights come from the photo notes. Covering words come from the trade glossary."
      >
        <Fields run={run} />
      </Section>
      <Section id="curves" title="Quotes sent without edits, every ten jobs per roofer" lede="The dashed line is 100%. Each roofer starts with no rules, and the engine learns from the quotes they actually send.">
        <Curves run={run} names={data.names} />
      </Section>
      <Section id="roofers" title="What each roofer does differently, and what the engine learned">
        <Roofers run={run} />
      </Section>
    </>
  );
}

export function App() {
  const q = useConsole();
  const [which, setWhich] = useState<Which>("dev");
  const run = q.data ? (which === "heldout" && q.data.heldout ? q.data.heldout : q.data.dev) : null;
  return (
    <div className="page">
      <header className="masthead">
        <span className="product">roof-quote-engine</span>
        {q.data && (
          <Segmented<Which>
            label="Which world"
            options={(q.data.heldout ? { dev: "Dev world", heldout: "Held-out world" } : { dev: "Dev world" }) as Record<Which, string>}
            value={which}
            onChange={setWhich}
          />
        )}
      </header>
      <main>
        {q.isPending && <Skeleton />}
        {q.isError && <ErrorState message={(q.error as Error).message} onRetry={() => q.refetch()} />}
        {run && q.data && <Desk key={run.world} run={run} data={q.data} />}
      </main>
    </div>
  );
}
