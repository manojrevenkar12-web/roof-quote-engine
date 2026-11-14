/** HTTP API over the quote service. Inputs are validated with zod; errors are JSON with a status that says why. */
import express, { type NextFunction, type Request, type Response } from "express";
import { z } from "zod";
import type { QuoteService } from "../service.js";

const JobIn = z.object({
  partnerId: z.string().min(1),
  jobId: z.string().min(1),
  inputs: z.object({ voice: z.string().min(1), photos: z.array(z.string()), plan: z.string().nullable(), address: z.string() }),
});
const SentIn = z.object({ lines: z.array(z.object({ code: z.string(), qty: z.number().nonnegative(), unitPrice: z.number().nonnegative() })).min(1) });

export function app(svc: QuoteService) {
  const a = express();
  a.use(express.json({ limit: "1mb" }));
  a.get("/health", (_req, res) => {
    res.json({ ok: true });
  });
  a.post("/jobs", async (req, res) => {
    const body = JobIn.safeParse(req.body);
    if (!body.success) return void res.status(422).json({ error: "invalid job", issues: body.error.issues });
    res.status(201).json(await svc.quote(body.data.partnerId, body.data.jobId, body.data.inputs));
  });
  a.post("/quotes/:id/sent", async (req, res) => {
    const body = SentIn.safeParse(req.body);
    if (!body.success) return void res.status(422).json({ error: "invalid quote", issues: body.error.issues });
    res.json(await svc.sent(Number(req.params.id), body.data.lines));
  });
  a.get("/partners/:id/rules", async (req, res) => {
    const r = await svc.rules(req.params.id);
    if (!r) return void res.status(404).json({ error: "unknown partner" });
    res.json(r);
  });
  a.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    const status = /unknown|no proposed/.test(err.message) ? 404 : /duplicate key/.test(err.message) ? 409 : 500;
    res.status(status).json({ error: err.message });
  });
  return a;
}
