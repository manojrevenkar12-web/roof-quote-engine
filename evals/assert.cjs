// Field by field against the true spec. Dimensions within 3% count as right: code settles them from the plan or a
// satellite footprint anyway. Returns a score so promptfoo can track the share of fields right.
module.exports = (output, context) => {
  const got = JSON.parse(output.replace(/^```json|```$/g, "").trim());
  const want = JSON.parse(context.vars.expected);
  const fields = ["roof", "pitch", "storeys", "renovation", "family", "insulationCm", "skylights", "chimneys", "gutterOld"];
  const wrong = fields.filter((f) => got[f] !== want[f]);
  for (const f of ["length", "width"]) if (Math.abs((got[f] ?? 0) - want[f]) > 0.03 * want[f]) wrong.push(f);
  const score = 1 - wrong.length / (fields.length + 2);
  return { pass: wrong.length === 0, score, reason: wrong.length ? `wrong: ${wrong.join(", ")}` : "all fields right" };
};
