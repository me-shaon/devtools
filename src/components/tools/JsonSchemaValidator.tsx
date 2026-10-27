import { useEffect, useMemo, useState } from "react";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { ToolFaqSection, type ToolFaqItem } from "@/components/tools/ToolFaq";
import { CodeTextarea, EditorPane, ToolWorkspace } from "@/components/tools/ToolWorkspace";
import {
  compileSchema,
  DRAFT_LABELS,
  generateSchema,
  loadValidator,
  locate,
  parseDocument,
  type ParsedDocument,
  type SchemaIssue,
  type ValidatorModules,
} from "@/utils/json-schema";

const FAQ_ITEMS: ToolFaqItem[] = [
  {
    q: "Which JSON Schema drafts are supported?",
    a: "Draft 2020-12, 2019-09, draft-07, and draft-06. The tool reads the draft from `$schema`. Without `$schema`, it uses draft-07. Draft-04 schemas are checked with the draft-07 rules after the tool converts `id` and boolean `exclusiveMinimum` and `exclusiveMaximum`.",
  },
  {
    q: "Does the tool fetch a remote $ref?",
    a: "No. The tool works offline and never fetches a URL. A `$ref` to a place in the same schema, such as `#/$defs/user`, works. For a remote schema, copy it into `$defs` and point the `$ref` at it.",
  },
  {
    q: "How do I find the value that failed?",
    a: "Each error shows the path to the value, such as `/items/2/price`, and the keyword that failed. Click an error to select that value in the data. For a property that is not allowed, the tool selects the property name.",
  },
  {
    q: "Can I validate YAML, such as a Kubernetes manifest?",
    a: "Yes. Text that does not start with `{` or `[` is read as YAML. This works for the data and for the schema.",
  },
  {
    q: "Are formats such as email and date-time checked?",
    a: "Yes. The tool checks the formats from the specification, including `email`, `uri`, `date-time`, `uuid`, and `ipv4`. Unknown keywords, such as the `x-` keywords in OpenAPI, are ignored.",
  },
  {
    q: "How do I start a schema for my data?",
    a: "Paste the data first, then click Generate from data. The tool writes a draft 2020-12 schema with the types and required properties from the sample. Edit it to add limits, formats, and optional properties.",
  },
];

/** Selects a range in a text area and scrolls it into view. */
const selectRange = (fieldId: string, doc: ParsedDocument | undefined, issue: SchemaIssue) => {
  const field = document.getElementById(fieldId);
  if (!(field instanceof HTMLTextAreaElement) || !doc?.ok) return;
  const range = locate(doc, issue.pointer, issue.key);
  if (!range) return;
  field.focus();
  field.setSelectionRange(range.start, range.end);
  const line = field.value.slice(0, range.start).split("\n").length - 1;
  const lineHeight = parseFloat(getComputedStyle(field).lineHeight) || 22;
  field.scrollTop = Math.max(0, line * lineHeight - field.clientHeight / 3);
};

const plural = (count: number, word: string) => `${count.toLocaleString()} ${word}${count === 1 ? "" : "s"}`;

function IssueList({ issues, onSelect }: { issues: SchemaIssue[]; onSelect: (issue: SchemaIssue) => void }) {
  return (
    <ul className="schema-issue-list">
      {issues.map((issue, index) => (
        <li key={`${issue.pointer}-${issue.keyword}-${index}`}>
          <button type="button" className="schema-issue" onClick={() => onSelect(issue)}>
            <code className="schema-issue-path">{issue.path}</code>
            <span className="schema-issue-message">{issue.message}</span>
            <code className="schema-issue-keyword">{issue.keyword}</code>
          </button>
        </li>
      ))}
    </ul>
  );
}

export function JsonSchemaValidator() {
  const [schemaInput, setSchemaInput] = useState("");
  const [dataInput, setDataInput] = useState("");
  const [modules, setModules] = useState<ValidatorModules>();
  const [loadError, setLoadError] = useState("");
  const schemaText = useDebouncedValue(schemaInput);
  const dataText = useDebouncedValue(dataInput);

  useEffect(() => {
    let active = true;
    loadValidator()
      .then((loaded) => active && setModules(loaded))
      .catch(() => active && setLoadError("The validator could not load. Reopen the tool to try again."));
    return () => {
      active = false;
    };
  }, []);

  const schemaDoc = useMemo(() => (schemaText.trim() ? parseDocument(schemaText) : undefined), [schemaText]);
  const dataDoc = useMemo(() => (dataText.trim() ? parseDocument(dataText) : undefined), [dataText]);
  // Compile only when the schema changes, so typing in the data stays fast.
  const compiled = useMemo(() => (modules && schemaDoc?.ok ? compileSchema(modules, schemaDoc.value) : undefined), [modules, schemaDoc]);
  const issues = useMemo(() => (compiled?.ok && dataDoc?.ok ? compiled.validate(dataDoc.value) : undefined), [compiled, dataDoc]);

  const generate = () => {
    if (dataDoc?.ok) setSchemaInput(generateSchema(dataDoc.value));
  };

  const errors: string[] = [];
  if (loadError) errors.push(loadError);
  if (schemaDoc && "error" in schemaDoc) errors.push(`Schema: ${schemaDoc.error}`);
  if (compiled && "error" in compiled) errors.push(compiled.error);
  if (dataDoc && "error" in dataDoc) errors.push(`Data: ${dataDoc.error}`);
  const schemaIssues = compiled && "issues" in compiled ? compiled.issues : undefined;

  const notice = (
    <>
      {errors.length > 0 && (
        <div className="workspace-notice" data-tone="error" role="alert">
          {errors.map((error) => <p key={error}>{error}</p>)}
          {schemaIssues && schemaIssues.length > 0 && (
            <IssueList issues={schemaIssues} onSelect={(issue) => selectRange("json-schema-input", schemaDoc, issue)} />
          )}
        </div>
      )}
      {compiled?.ok && compiled.notice && <div className="workspace-notice">{compiled.notice}</div>}
      {issues && issues.length === 0 && (
        <div className="workspace-notice" data-tone="success" role="status">Valid. The data matches the schema.</div>
      )}
      {issues && issues.length > 0 && (
        <div className="workspace-notice schema-issues" data-tone="error">
          <p role="status">{plural(issues.length, "error")}. Click an error to select it in the data.</p>
          <IssueList issues={issues} onSelect={(issue) => selectRange("json-schema-data", dataDoc, issue)} />
        </div>
      )}
    </>
  );

  return (
    <ToolWorkspace
      id="json-schema"
      notice={notice}
      first={
        <EditorPane
          title="Schema"
          htmlFor="json-schema-input"
          scroll={false}
          actions={
            <>
              {!schemaInput.trim() && dataDoc?.ok && (
                <button type="button" className="toolbar-text-button" onClick={generate}>Generate from data</button>
              )}
              {schemaInput && <button type="button" className="toolbar-text-button" onClick={() => setSchemaInput("")}>Clear</button>}
            </>
          }
        >
          <CodeTextarea
            id="json-schema-input"
            placeholder={'Paste a JSON Schema (e.g., {"type": "object", "required": ["name"]})'}
            value={schemaInput}
            onChange={(e) => setSchemaInput(e.target.value)}
          />
        </EditorPane>
      }
      second={
        <EditorPane
          title="Data"
          htmlFor="json-schema-data"
          scroll={false}
          actions={dataInput ? <button type="button" className="toolbar-text-button" onClick={() => setDataInput("")}>Clear</button> : undefined}
        >
          <CodeTextarea
            id="json-schema-data"
            placeholder="Paste the JSON or YAML to check"
            value={dataInput}
            onChange={(e) => setDataInput(e.target.value)}
          />
        </EditorPane>
      }
      status={
        <>
          {compiled?.ok && <span>{DRAFT_LABELS[compiled.draft]}</span>}
          {dataDoc?.ok && <span>{dataDoc.format === "yaml" ? "YAML data" : "JSON data"}</span>}
          {errors.length > 0 ? (
            <span className="text-destructive">Invalid input</span>
          ) : issues ? (
            issues.length ? <span className="text-destructive">{plural(issues.length, "error")}</span> : <span>Valid</span>
          ) : !modules && !loadError ? (
            <span>Loading validator</span>
          ) : (
            <span>Ready</span>
          )}
        </>
      }
      help={<ToolFaqSection items={FAQ_ITEMS} />}
    />
  );
}
