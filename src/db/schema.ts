/** Postgres tables (Drizzle). PGlite in tests and the demo, any Postgres in production. */
import { integer, jsonb, numeric, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import type { JobSpec, Line, Rule } from "../core/types.js";

export const partners = pgTable("partners", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  city: text("city").notNull(),
  rules: jsonb("rules").$type<Rule[]>().notNull().default([]),
  wastes: jsonb("wastes").$type<number[]>().notNull().default([]),
});

export const catalogItems = pgTable("catalog_items", {
  code: text("code").primaryKey(),
  partnerId: text("partner_id").notNull().references(() => partners.id),
  name: text("name").notNull(),
  unit: text("unit").notNull(),
  price: numeric("price", { mode: "number" }).notNull(),
  kind: text("kind").notNull(),
  family: text("family"),
});

export const jobs = pgTable("jobs", {
  id: text("id").primaryKey(),
  partnerId: text("partner_id").notNull().references(() => partners.id),
  inputs: jsonb("inputs").notNull(),
  spec: jsonb("spec").$type<JobSpec>().notNull(),
  source: text("source").notNull(),
  questions: jsonb("questions").$type<string[]>().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const quotes = pgTable("quotes", {
  id: serial("id").primaryKey(),
  jobId: text("job_id").notNull().references(() => jobs.id),
  status: text("status").$type<"proposed" | "sent">().notNull(),
  lines: jsonb("lines").$type<Line[]>().notNull(),
  total: numeric("total", { mode: "number" }).notNull(),
  edits: integer("edits"),
});

export const glossary = pgTable("glossary", {
  phrase: text("phrase").primaryKey(),
  counts: jsonb("counts").$type<Record<string, number>>().notNull(),
});

export const DDL = `
create table if not exists partners (id text primary key, name text not null, city text not null,
  rules jsonb not null default '[]', wastes jsonb not null default '[]');
create table if not exists catalog_items (code text primary key, partner_id text not null references partners(id),
  name text not null, unit text not null, price numeric not null, kind text not null, family text);
create table if not exists jobs (id text primary key, partner_id text not null references partners(id), inputs jsonb not null,
  spec jsonb not null, source text not null, questions jsonb not null, created_at timestamp not null default now());
create table if not exists quotes (id serial primary key, job_id text not null references jobs(id), status text not null,
  lines jsonb not null, total numeric not null, edits integer);
create table if not exists glossary (phrase text primary key, counts jsonb not null);
`;
