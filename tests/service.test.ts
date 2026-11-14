import { readFileSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { app } from "../src/api/app.js";
import type { JobSpec } from "../src/core/types.js";
import { QuoteService } from "../src/service.js";
import { World } from "../src/world/sim.js";

const ROOT = join(import.meta.dirname, "..");
const cfg = JSON.parse(readFileSync(join(ROOT, "config", "engine.json"), "utf8"));
const world = new World(JSON.parse(readFileSync(join(ROOT, "config", "world.json"), "utf8")));

async function server() {
  const byVoice = new Map(world.jobs.map((j) => [j.inputs.voice + j.inputs.address, j.id]));
  const reader = async (inputs: any) => world.extract(byVoice.get(inputs.voice + inputs.address)!) as JobSpec;
  const svc = await QuoteService.open(reader, cfg);
  const p = world.partners.find((x) => x.habits.scaffold === "always")!;
  await svc.addPartner(p);
  const s = app(svc).listen(0);
  const base = `http://127.0.0.1:${(s.address() as AddressInfo).port}`;
  const call = async (method: string, path: string, body?: unknown) => {
    const r = await fetch(base + path, { method, headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
    return { status: r.status, body: await r.json() };
  };
  return { svc, p, call, close: () => s.close() };
}

describe("quote API", () => {
  it("quotes a job, takes the sent quote back and learns the roofer's scaffolding habit", async () => {
    const { p, call, close } = await server();
    const jobs = world.jobs.filter((j) => j.partner === p.id).slice(0, 25);
    let learned: unknown[] = [];
    for (const j of jobs) {
      const q = await call("POST", "/jobs", { partnerId: p.id, jobId: j.id, inputs: j.inputs });
      expect(q.status).toBe(201);
      expect(q.body.lines.length).toBeGreaterThan(3);
      const s = await call("POST", `/quotes/${q.body.quoteId}/sent`, { lines: world.truthQuote(j.id) });
      expect(s.status).toBe(200);
      learned = (await call("GET", `/partners/${p.id}/rules`)).body.rules;
    }
    expect(learned).toContainEqual({ type: "include", kind: "scaffold", when: "always", on: true });
    close();
  });

  it("says what is wrong with a request", async () => {
    const { call, close } = await server();
    expect((await call("POST", "/jobs", { partnerId: "P1" })).status).toBe(422);
    expect((await call("GET", "/partners/nobody/rules")).status).toBe(404);
    const j = world.jobs[0];
    expect((await call("POST", "/jobs", { partnerId: "nobody", jobId: "x", inputs: j.inputs })).status).toBe(404);
    expect((await call("POST", "/quotes/999/sent", { lines: [{ code: "x", qty: 1, unitPrice: 1 }] })).status).toBe(404);
    close();
  });
});
