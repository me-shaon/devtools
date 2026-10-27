import { parseAllDocuments, stringify, YAMLError } from "yaml";

export type YamlIndent = 2 | 4;

export interface ConversionResult {
  output: string;
  /** Number of YAML documents read. Above 1, the JSON output is an array with one item per document. */
  documents: number;
}

/** An input error with a 1-based line and column when the parser reports one. */
export class ConversionError extends Error {
  constructor(message: string, readonly line?: number, readonly column?: number) {
    super(message);
    this.name = "ConversionError";
  }
}

const withPosition = (message: string, line?: number, column?: number) =>
  line ? `Line ${line}, column ${column ?? 1}: ${message}` : message;

const yamlError = (error: YAMLError) => {
  const pos = error.linePos?.[0];
  // prettyErrors appends a source excerpt after the first line. Keep the message short.
  const text = error.message.split("\n")[0].replace(/ at line \d+, column \d+:?$/, "").trim();
  return new ConversionError(withPosition(text, pos?.line, pos?.col), pos?.line, pos?.col);
};

/** Converts YAML to JSON. Several documents (separated by ---) become a JSON array. */
export function yamlToJson(input: string, indent: YamlIndent = 2): ConversionResult {
  if (!input.trim()) return { output: "", documents: 0 };
  const parsed = parseAllDocuments(input, { prettyErrors: true });
  const docs = Array.isArray(parsed) ? parsed : [parsed];
  for (const doc of docs) {
    if (doc.errors.length) throw yamlError(doc.errors[0]);
  }
  // A stream that has only comments has no content documents.
  const values = docs.filter((doc) => doc.contents !== null || docs.length === 1).map((doc) => doc.toJS({ maxAliasCount: 1000 }));
  if (values.length === 0) return { output: "null", documents: 0 };
  const value = values.length === 1 ? values[0] : values;
  return { output: JSON.stringify(value ?? null, null, indent), documents: values.length };
}

/** Finds the line and column of a JSON.parse error, from either "position N" or "line L column C" in the message. */
const jsonErrorPosition = (input: string, message: string) => {
  const lineCol = /line (\d+) column (\d+)/.exec(message);
  if (lineCol) return { line: Number(lineCol[1]), column: Number(lineCol[2]) };
  const pos = /position (\d+)/.exec(message);
  if (!pos) return {};
  const before = input.slice(0, Number(pos[1]));
  const lines = before.split("\n");
  return { line: lines.length, column: lines[lines.length - 1].length + 1 };
};

/** Converts JSON to YAML. */
export function jsonToYaml(input: string, indent: YamlIndent = 2): ConversionResult {
  if (!input.trim()) return { output: "", documents: 0 };
  let value: unknown;
  try {
    value = JSON.parse(input);
  } catch (error) {
    const raw = error instanceof Error ? error.message : "Check the syntax.";
    const { line, column } = jsonErrorPosition(input, raw);
    const message = `Invalid JSON. ${raw.replace(/\s*\(line \d+ column \d+\)/, "").replace(/ in JSON at position \d+.*$/, "")}`;
    throw new ConversionError(withPosition(message, line, column), line, column);
  }
  return { output: stringify(value, { indent, lineWidth: 0 }), documents: 1 };
}
