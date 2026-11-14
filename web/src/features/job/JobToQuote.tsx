import { motion } from "framer-motion";
import { eur, motion as m, qty } from "../../app/theme";
import type { ExampleLine, Run } from "../../shared/types";

const near = (a: number, b: number) => Math.abs(a - b) <= 0.03 * Math.max(a, b, 1);

function Cell({ value, sent, unit }: { value: number; sent: number; unit: string }) {
  const right = near(value, sent);
  const text = value ? `${qty(value)} ${unit}` : "–";
  return (
    <span role="cell" className={right ? "q" : "q off"} aria-label={right ? text : `${text}, roofer sent ${sent ? qty(sent) : "none"}`}>
      {text}
    </span>
  );
}

export function JobToQuote({ run }: { run: Run }) {
  const e = run.example;
  const lineTotal = (l: ExampleLine) => l.final * l.unitPrice;
  return (
    <div className="job">
      <div className="inputs">
        <figure className="voice">
          <blockquote lang="de">{e.inputs.voice}</blockquote>
          <figcaption>
            Voice note, {e.inputs.address}. Job {e.id} for {e.partner}.
          </figcaption>
        </figure>
        <ul className="photos" aria-label="Photo notes" lang="de">
          {e.inputs.photos.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
        <p className="plan" lang="de">
          {e.inputs.plan ?? "No plan attached. Length and width come from the satellite footprint."}
        </p>
      </div>
      <div className="quote" role="table" aria-label={`Quote for job ${e.id}`}>
        <div className="quote-row head" role="row">
          <span role="columnheader">Catalog item</span>
          <span role="columnheader">Model alone</span>
          <span role="columnheader">Engine</span>
          <span role="columnheader">Roofer sent, €</span>
        </div>
        {e.lines.map((l, i) => (
          <motion.div key={l.code} role="row" className="quote-row" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ ...m.rise, delay: i * m.stagger }}>
            <span role="rowheader" className="item">
              <b>{l.code}</b> {l.name}
            </span>
            <Cell value={l.llm} sent={l.final} unit={l.unit} />
            <Cell value={l.proposed} sent={l.final} unit={l.unit} />
            <span role="cell" className="q sent">
              {l.final ? eur(lineTotal(l)) : "–"}
            </span>
          </motion.div>
        ))}
        <div className="quote-row total" role="row">
          <span role="rowheader">Net total</span>
          <span role="cell" className={e.llmEdits ? "q off" : "q"}>
            {eur(e.llmTotal)}
            <small>{e.llmEdits} edits</small>
          </span>
          <span role="cell" className={e.edits ? "q off" : "q"}>
            {eur(e.proposedTotal)}
            <small>{e.edits ? `${e.edits} edits` : "sent as proposed"}</small>
          </span>
          <span role="cell" className="q sent">
            {eur(e.finalTotal)}
          </span>
        </div>
      </div>
    </div>
  );
}
