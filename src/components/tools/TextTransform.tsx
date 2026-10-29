import { useEffect, useState, type ReactNode } from "react";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { Input } from "@/components/ui/input";
import {
  transformText,
  type TextTransform as Operation,
  type TransformOptions,
} from "@/utils/text-transform";
import { REGEX_TIMEOUT_MS, runRegexInWorker } from "@/utils/regex-runner";
import {
  CodeTextarea,
  EditorPane,
  PaneEmpty,
  ToolWorkspace,
} from "./ToolWorkspace";
import { CopyButton } from "./CopyButton";
/** Line Tools owns the input and options, so they stay the same across its modes. */
export function TextTransform({
  navigation,
  input,
  onInputChange,
  options,
  onOptionsChange,
}: {
  navigation: ReactNode;
  input: string;
  onInputChange: (input: string) => void;
  options: TransformOptions;
  onOptionsChange: (options: TransformOptions) => void;
}) {
  const { operation, first, second } = options;
  const set = (patch: Partial<TransformOptions>) =>
    onOptionsChange({ ...options, ...patch });
  const [output, setOutput] = useState("");
  const [error, setError] = useState("");
  const text = useDebouncedValue(input),
    a = useDebouncedValue(first),
    b = useDebouncedValue(second);
  useEffect(() => {
    setOutput("");
    setError("");
    if (!text) return;
    if (operation !== "regex") {
      try {
        setOutput(transformText(text, operation, a, b));
      } catch (e) {
        setError((e as Error).message);
      }
      return;
    }
    // $` and $' insert the text before or after each match, so the output can grow with the square of the input.
    const perMatch = b.length + 1 + (/\$[`']/.test(b) ? text.length : 0);
    if (
      text.length > 200000 ||
      a.length > 10000 ||
      (text.length + 1) * perMatch > 2_000_000
    ) {
      setError(
        "Input or potential output is too large. Shorten the text, pattern, or replacement (2 million output character limit).",
      );
      return;
    }
    let cancelled = false;
    runRegexInWorker({
      pattern: a,
      flags: "g",
      text,
      replacement: b,
      limit: 0,
    }).then((result) => {
      // A null result means a newer run replaced this one.
      if (cancelled || !result) return;
      if ("error" in result) setError(result.error);
      else setOutput(result.replaced ?? "");
    });
    return () => {
      cancelled = true;
    };
  }, [text, operation, a, b]);
  return (
    <ToolWorkspace
      wrapToolbar
      id="line-tools"
      toolbar={
        <>
          {navigation}
          <select
            className="rounded-md border bg-background px-2 pr-7 py-1 text-sm"
            aria-label="Transformation"
            value={operation}
            onChange={(e) => set({ operation: e.target.value as Operation })}
          >
            {(
              [
                "split",
                "join",
                "wrap",
                "replace",
                "regex",
                "sum",
                "product",
              ] as const
            ).map((x) => (
              <option key={x} value={x}>
                {
                  {
                    split: "Split",
                    join: "Join",
                    wrap: "Wrap",
                    replace: "Replace text",
                    regex: "Regex replace",
                    sum: "Sum",
                    product: "Product",
                  }[x]
                }
              </option>
            ))}
          </select>
        </>
      }
      secondaryToolbar={
        !["sum", "product"].includes(operation) && (
          <>
            <Input
              className="max-w-72"
              aria-label={
                operation === "wrap"
                  ? "Prefix"
                  : operation === "split" || operation === "join"
                    ? "Separator"
                    : "Find"
              }
              placeholder={
                operation === "wrap" ? "Prefix" : "Separator or pattern"
              }
              value={first}
              onChange={(e) => set({ first: e.target.value })}
            />
            {["wrap", "replace", "regex"].includes(operation) && (
              <Input
                className="max-w-72"
                aria-label={operation === "wrap" ? "Suffix" : "Replacement"}
                placeholder={operation === "wrap" ? "Suffix" : "Replacement"}
                value={second}
                onChange={(e) => set({ second: e.target.value })}
              />
            )}
          </>
        )
      }
      notice={
        error && (
          <p role="alert" className="workspace-notice" data-tone="error">
            {error}
          </p>
        )
      }
      first={
        <EditorPane title="Input" htmlFor="transform-input">
          <CodeTextarea
            id="transform-input"
            value={input}
            onChange={(e) => onInputChange(e.target.value)}
          />
        </EditorPane>
      }
      second={
        <EditorPane title="Result" actions={<CopyButton value={output} />}>
          {output ? (
            <pre className="p-4 whitespace-pre-wrap break-all font-mono text-sm">
              {output}
            </pre>
          ) : (
            <PaneEmpty title={error ? "Check your input" : "Transform text"} />
          )}
        </EditorPane>
      }
      status={
        <span>
          {operation === "sum" || operation === "product"
            ? "One number per line · decimal results use floating-point arithmetic"
            : operation === "regex"
              ? `JavaScript regex · global replacement · ${REGEX_TIMEOUT_MS / 1000} s limit`
              : "Apply one operation, then copy the result to continue"}
        </span>
      }
    />
  );
}
