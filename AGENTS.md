# AGENTS.md

How to work in this repository, for people and coding agents.

## Fast feedback

```bash
npm test                               # ~5 s: unit, API on PGlite, invariants, report
npx tsc --noEmit
npx tsx scripts/evaluate.ts            # ~3 s, writes reports/dev.json
npx tsx scripts/gate.ts
npx tsx scripts/export.ts              # promptfoo cases and the API example
npx tsx scripts/readme.ts              # README.md and web/public/data/console.json
cd web && npm test && npm run build
```

Commit the regenerated files. CI fails when one does not match its source.

## Invariants

1. **Truth stays in the world.** `src/world/` holds the true roofs, each roofer's real habits and the model's
   mistakes. Only `scripts/evaluate.ts`, `scripts/export.ts` and the tests import it; `tests/invariants.test.ts`
   checks this.
2. **The world does not read the engine's settings.** `config/world.json` and `config/heldout.json` drive the world;
   `config/engine.json` drives measuring, pricing and learning.
3. **Same luck for every design.** Every draw is keyed by job and field, never by design, so the four designs quote
   the same jobs with the same misreadings.
4. **The model reads, code decides.** The model fills `JobSpec`. Measurements, quantities, prices and which catalog
   items go on the quote are code.
5. **No rule without a replay.** A roofer's habit becomes a rule only through `gated()`: enough support, then more
   of their past quotes fixed than broken, with a one-sided sign test.
6. **Settings in config, results generated.** No number in README.md or the console is typed by hand.

## Held-out rule

`npx tsx scripts/evaluate.ts --heldout` runs the held-out world once and writes `config/heldout.lock`. After that,
changes are measured on the dev world only; findings go in `docs/heldout.md`. `config/gate.json` is not moved.
