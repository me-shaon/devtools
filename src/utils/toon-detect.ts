/**
 * Finds TOON array headers in text. This module has no imports, so the paste detector in the
 * main bundle can use it without the YAML parser or the TOON encoder.
 */

/** A TOON array header: key[N]:, key[N]{a,b}:, [N]:, or a list item "- [N]:". The length can carry a delimiter and a colon. */
const TOON_HEADER = /^(- )?("(?:[^"\\]|\\.)*"|[A-Za-z_][\w.]*)?\[(\d+)([\t|]?:?|:?[\t|]?)\](\{[^}]*\})?:(.*)$/;

/**
 * True when a line is a TOON array header. Spaces and tabs around the line are ignored.
 * YAML allows a key such as "a[2]", so an inline array must also hold exactly N values
 * before the line counts as TOON.
 */
export const isToonHeaderLine = (line: string) => {
  const match = TOON_HEADER.exec(line.trim());
  if (!match) return false;
  const [, , , length, marker, fields, rest] = match;
  const values = rest.trim();
  if (fields || !values) return true;
  const delimiter = marker.includes("|") ? "|" : marker.includes("\t") ? "\t" : ",";
  return values.split(delimiter).length === Number(length);
};

/** True when any line of the text is a TOON array header. */
export const looksLikeToon = (text: string) => text.split(/\r?\n/).some(isToonHeaderLine);
