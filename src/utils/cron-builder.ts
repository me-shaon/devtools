export type BuilderMode =
  "every" | "specific" | "range" | "interval" | "custom";
export function cronFieldValue(
  mode: BuilderMode,
  first: string,
  second: string,
): string {
  if (mode === "every") return "*";
  if (mode === "custom") return first;
  const valid =
    mode === "specific"
      ? /^\d+(?:,\d+)*$/.test(first)
      : /^\d+$/.test(first) && /^\d+$/.test(second);
  if (!valid)
    throw new Error(
      "Use whole numbers, or a comma-separated list for specific values.",
    );
  if (mode === "range" && Number(first) > Number(second))
    throw new Error("The range start must not exceed its end.");
  if (mode === "interval" && Number(second) < 1)
    throw new Error("The interval must be at least 1.");
  return mode === "specific"
    ? first
    : mode === "range"
      ? `${first}-${second}`
      : `${first}/${second}`;
}
