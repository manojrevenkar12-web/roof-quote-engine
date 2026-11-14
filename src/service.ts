/** The quote service: one job in, a proposed quote out; one sent quote in, the roofer's rules updated. */
import { PGlite } from "@electric-sql/pglite";
import { and, asc, eq } from "drizzle-orm";
import { drizzle, type PgliteDatabase } from "drizzle-orm/pglite";
import { DDL, catalogItems, glossary, jobs, partners, quotes } from "./db/schema.js";
import { evidence, gated, glossaryEvidence, glossaryFrom, type Decision, type GlossaryEvidence } from "./core/learn.js";
import { materialPhrase, settle } from "./core/measure.js";
import { buildQuote, total, wasteOf, type Defaults } from "./core/quote.js";
import { diff, edits } from "./core/score.js";
import type { CatalogItem, Inputs, JobSpec, Line } from "./core/types.js";
import type { Reader } from "./llm/reader.js";

export type EngineConfig = {
  defaults: Defaults;
  measurement: { askWhenOnlyVoice: boolean };
  learning: { minSupport: number; minNetFixed: number; maxP: number; replayLast: number };
};
export type Satellite = (address: string) => Promise<{ length: number; width: number } | null>;

export class QuoteService {
  private constructor(
    readonly db: PgliteDatabase,
    private readonly read: Reader,
    private readonly cfg: EngineConfig,
    private readonly satellite: Satellite = async () => null,
  ) {}

  static async open(read: Reader, cfg: EngineConfig, opts: { dataDir?: string; satellite?: Satellite } = {}) {
    const client = new PGlite(opts.dataDir);
    await client.exec(DDL);
    return new QuoteService(drizzle({ client }), read, cfg, opts.satellite);
  }

  async addPartner(p: { id: string; name: string; city: string; catalog: CatalogItem[] }) {
    await this.db.insert(partners).values({ id: p.id, name: p.name, city: p.city }).onConflictDoNothing();
    for (const i of p.catalog) await this.db.insert(catalogItems).values({ ...i, partnerId: p.id }).onConflictDoNothing();
  }

  async catalog(partnerId: string): Promise<CatalogItem[]> {
    const rows = await this.db.select().from(catalogItems).where(eq(catalogItems.partnerId, partnerId));
    return rows.map((r) => ({ code: r.code, name: r.name, unit: r.unit as CatalogItem["unit"], price: r.price, kind: r.kind as CatalogItem["kind"], family: r.family ?? undefined }));
  }

  private async glossaryEv(): Promise<GlossaryEvidence> {
    const rows = await this.db.select().from(glossary);
    return Object.fromEntries(rows.map((r) => [r.phrase, r.counts]));
  }

  async quote(partnerId: string, jobId: string, inputs: Inputs) {
    const [partner] = await this.db.select().from(partners).where(eq(partners.id, partnerId));
    if (!partner) throw new Error(`unknown partner ${partnerId}`);
    const catalog = await this.catalog(partnerId);
    const read = await this.read(inputs);
    const sat = await this.satellite(inputs.address);
    const gl = glossaryFrom(await this.glossaryEv(), this.cfg.learning.minSupport - 1);
    const m = settle(jobId, inputs, read, { satellite: () => sat, ask: () => null }, this.cfg.measurement, gl);
    const lines = buildQuote(m.spec, catalog, this.cfg.defaults, partner.rules);
    await this.db.insert(jobs).values({ id: jobId, partnerId, inputs, spec: m.spec, source: m.source, questions: m.questions });
    const [q] = await this.db.insert(quotes).values({ jobId, status: "proposed", lines, total: total(lines) }).returning();
    return { quoteId: q.id, spec: m.spec, source: m.source, questions: m.questions, lines, total: total(lines) };
  }

  /** The roofer sent the quote, perhaps edited. Learn from the difference. */
  async sent(quoteId: number, final: Line[]): Promise<{ edits: number; decisions: Decision[] }> {
    const [proposed] = await this.db.select().from(quotes).where(eq(quotes.id, quoteId));
    if (!proposed || proposed.status !== "proposed") throw new Error(`no proposed quote ${quoteId}`);
    const [job] = await this.db.select().from(jobs).where(eq(jobs.id, proposed.jobId));
    const [partner] = await this.db.select().from(partners).where(eq(partners.id, job.partnerId));
    const catalog = await this.catalog(partner.id);
    const n = edits(diff(proposed.lines, final));
    await this.db.insert(quotes).values({ jobId: job.id, status: "sent", lines: final, total: total(final), edits: n });
    const ev = evidence(proposed.lines, final, catalog, wasteOf(this.cfg.defaults, partner.rules));
    const wastes = ev.waste !== null && Math.abs(ev.waste) < 0.5 ? [...partner.wastes, ev.waste] : partner.wastes;
    const gev = await this.glossaryEv();
    glossaryEvidence(gev, materialPhrase((job.inputs as Inputs).voice), proposed.lines, final, catalog);
    for (const [phrase, counts] of Object.entries(gev)) {
      await this.db.insert(glossary).values({ phrase, counts }).onConflictDoUpdate({ target: glossary.phrase, set: { counts } });
    }
    const sentRows = await this.db
      .select({ jobId: jobs.id, spec: jobs.spec, final: quotes.lines })
      .from(quotes)
      .innerJoin(jobs, eq(quotes.jobId, jobs.id))
      .where(and(eq(jobs.partnerId, partner.id), eq(quotes.status, "sent")))
      .orderBy(asc(quotes.id));
    const history = sentRows.map((r) => ({ jobId: r.jobId, spec: r.spec as JobSpec, final: r.final }));
    const g = gated(partner.rules, history, catalog, this.cfg.defaults, this.cfg.learning, wastes, history.length);
    await this.db.update(partners).set({ rules: g.rules, wastes }).where(eq(partners.id, partner.id));
    return { edits: n, decisions: g.log };
  }

  async rules(partnerId: string) {
    const [p] = await this.db.select().from(partners).where(eq(partners.id, partnerId));
    return p ? { rules: p.rules, glossary: glossaryFrom(await this.glossaryEv(), this.cfg.learning.minSupport - 1) } : null;
  }
}
