/**
 * Writes what a reader of the repo and the eval tools need from the dev world:
 * - evals/tests.json: 40 jobs (inputs and the true spec) for the promptfoo extraction eval;
 * - data/example.json: one roofer's catalog and ten jobs for the API demo.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { World } from "../src/world/sim.js";

const ROOT = join(import.meta.dirname, "..");
const world = new World(JSON.parse(readFileSync(join(ROOT, "config", "world.json"), "utf8")));
const picked = world.partners.flatMap((p) => world.jobs.filter((j) => j.partner === p.id).slice(0, 5));
const tests = picked.map((j) => ({
  description: j.id,
  vars: { voice: j.inputs.voice, photos: j.inputs.photos.join("\n"), plan: j.inputs.plan ?? "none", expected: JSON.stringify(world.spec(j.id)) },
}));
writeFileSync(join(ROOT, "evals", "tests.json"), JSON.stringify(tests, null, 1) + "\n");
mkdirSync(join(ROOT, "data"), { recursive: true });
const p = world.partners[0];
writeFileSync(
  join(ROOT, "data", "example.json"),
  JSON.stringify({ partner: { id: p.id, name: p.name, city: p.city, catalog: p.catalog }, jobs: world.jobs.filter((j) => j.partner === p.id).slice(0, 10) }, null, 1) + "\n",
);
