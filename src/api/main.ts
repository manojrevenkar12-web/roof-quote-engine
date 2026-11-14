/** Serve the API with the model reader. PORT, ANTHROPIC_API_KEY and DATA_DIR (PGlite directory) from the environment. */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { modelReader } from "../llm/reader.js";
import { QuoteService } from "../service.js";
import { app } from "./app.js";

const cfg = JSON.parse(readFileSync(join(import.meta.dirname, "..", "..", "config", "engine.json"), "utf8"));
const svc = await QuoteService.open(modelReader(), cfg, { dataDir: process.env.DATA_DIR });
const port = Number(process.env.PORT ?? 3000);
app(svc).listen(port, () => console.log(`roof-quote-engine on :${port}`));
