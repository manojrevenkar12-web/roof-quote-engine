// The same system prompt and rendering as src/llm/reader.ts, asking for JSON instead of a tool call.
const fs = require("node:fs");
const path = require("node:path");
const system = fs.readFileSync(path.join(__dirname, "..", "prompts", "extract.md"), "utf8");
module.exports = ({ vars }) => [
  { role: "system", content: system + "\n\nAnswer with one JSON object with the fields roof, length, width, pitch, storeys, renovation, family, insulationCm, skylights, chimneys, gutterOld." },
  { role: "user", content: `<voice_note>\n${vars.voice}\n</voice_note>\n<photo_notes>\n${vars.photos}\n</photo_notes>\n<plan>\n${vars.plan}\n</plan>` },
];
