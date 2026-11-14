/**
 * The model reads a job's voice note, photo notes and plan into a JobSpec through structured output (Vercel AI SDK,
 * zod schema). Off unless ANTHROPIC_API_KEY is set; tests use a fixture reader with the same signature.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { anthropic } from "@ai-sdk/anthropic";
import { generateObject, type LanguageModel } from "ai";
import { JobSpec, type Inputs } from "../core/types.js";

export type Reader = (inputs: Inputs) => Promise<JobSpec>;

const SYSTEM = readFileSync(join(import.meta.dirname, "..", "..", "prompts", "extract.md"), "utf8");

export function render(inputs: Inputs): string {
  return [
    `<voice_note>\n${inputs.voice}\n</voice_note>`,
    `<photo_notes>\n${inputs.photos.join("\n")}\n</photo_notes>`,
    inputs.plan ? `<plan>\n${inputs.plan}\n</plan>` : "<plan>none</plan>",
  ].join("\n");
}

export function modelReader(model: LanguageModel = anthropic("claude-sonnet-4-5")): Reader {
  return async (inputs) => {
    const { object } = await generateObject({ model, schema: JobSpec, system: SYSTEM, prompt: render(inputs), temperature: 0 });
    return object;
  };
}
