# Held-out run

The held-out world (`config/heldout.json`: 10 other roofers, 500 jobs, fewer plans and satellite tiles, more trade
slang, storeys left out of more voice notes) was run once at commit 53aac3d. Its report is `reports/heldout.json`
and it is not run again (`config/heldout.lock`).

## What it showed

| | Dev world | Held-out world |
|---|---|---|
| Gated rules, sent without edits | 72.8% | 66.8% |
| Gated rules, last 20 jobs per roofer | 81.3% | 74.5% |
| Naive rules, last 20 jobs per roofer | 40.6% | 54.5% |
| Model writes the whole quote, last 20 jobs | 3.1% | 6.0% |
| Edits per quote, gated | 0.55 | 0.73 |

The gate (`config/gate.json`, not moved) asks for 75% in the last 20 jobs. The held-out world ended at 74.5%, and
the lead over naive learning was exactly the 20 points the gate asks for.

## Why

With fewer architect's plans, more jobs were measured from the satellite footprint: 243 of 500. Only 116 of those
came within 1% of the true roof, because a footprint is about 2% off in each direction and the roof area carries
both errors. The engine took the satellite even when the roofer had said a tape measurement into the voice note
("14,09 mal 9,22 Meter"). A roofer measures on site to the centimetre; that is better evidence than a satellite
tile, and the engine threw it away.

The learning was not the problem. The rules learned on the held-out world match the roofers' real habits (scaffold
never, no gutters on renovations, their own waste), and naive learning still trailed by 20 points.

## What changed, measured on the dev world only

- `tapeFromVoice()` in `src/core/measure.ts` reads a centimetre measurement from the voice note with code. Anything
  said "so ungefähr" is still never priced from.
- The order is now plan, tape measurement, satellite footprint, customer question
  (`config/engine.json` `measurement.tapeBeforeSatellite`).
- A test covers the order and the rough-size case.

On the dev world, gated quotes sent without edits went from 72.8% to 76.3%, and from 81.3% to 86.9% in each roofer's
last 20 jobs. Edits per quote went from 0.55 to 0.48. The figures in README.md are the current dev run.

## Still open

A satellite footprint stays about 2% off. A roof without a plan or a tape measurement is still a likely edit; asking
the roofer to confirm the length on such jobs is the next thing to try, and it would be measured on the dev world.
