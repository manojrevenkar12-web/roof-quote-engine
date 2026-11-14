# SKILLS.md

## Onboard a roofer

1. `POST` their catalog through `QuoteService.addPartner` (code, name, unit, price, kind, covering family).
2. Import their last sent quotes with `sent()` in date order; rules and waste are learned through the replay gate.
3. Read `GET /partners/:id/rules` with them before the first live quote.

## Add a trade word

Covering words are learned from swaps between quoted and sent covering lines. To seed one, add it to the glossary
table; `measure.settle` maps the phrase to the family before pricing.

## Add an optional item kind or a condition

Add the kind to `OPTIONAL` or the condition to `FEATURES` in `src/core/types.ts`, its quantity in `takeoff.ts`, and
its test in `quote.holds`. The gate tries every kind and condition pair.

## Change the extraction prompt

Edit `prompts/extract.md`, run `npx tsx scripts/export.ts`, then `npx promptfoo eval -c evals/promptfooconfig.yaml`
with an API key. Compare field accuracy with the last run before merging.
