/**
 * Mermaid erDiagram import for the DB Diagram tool.
 * Mermaid relates entities, not columns. The import finds the foreign key column for each relationship
 * from the label, the FK marks, and the column names. When no column fits, it adds one.
 */

import { isMany, parseDbml, quoteName, type Cardinality, type DbError } from "@/utils/db-diagram/model";
import type { SqlResult } from "@/utils/db-diagram/sql";

interface Attribute {
  type: string;
  name: string;
  pk: boolean;
  fk: boolean;
  unique: boolean;
  note: string | null;
  /** The import added this column, because a relationship needed it. */
  added: boolean;
}

interface Entity {
  name: string;
  attributes: Attribute[];
}

interface Relationship {
  left: string;
  right: string;
  leftCardinality: Cardinality;
  rightCardinality: Cardinality;
  label: string;
}

const ENTITY = String.raw`("[^"]+"|[\p{L}\p{N}_-]+)`;
const ALIAS = String.raw`(?:\[(?:"[^"]*"|[^\]]*)\])?(?::::[\w-]+)?`;
const LEFT_SYMBOLS: Record<string, Cardinality> = { "||": "one", "|o": "zero-or-one", "}|": "many", "}o": "zero-or-many" };
const RIGHT_SYMBOLS: Record<string, Cardinality> = { "||": "one", "o|": "zero-or-one", "|{": "many", "o{": "zero-or-many" };
const WORDS: Record<string, Cardinality> = {
  "only one": "one",
  "1": "one",
  "zero or one": "zero-or-one",
  "one or zero": "zero-or-one",
  "one or more": "many",
  "one or many": "many",
  "many(1)": "many",
  "1+": "many",
  "zero or more": "zero-or-many",
  "zero or many": "zero-or-many",
  "many(0)": "zero-or-many",
  "0+": "zero-or-many",
};
const WORD = `(${Object.keys(WORDS)
  .map((word) => word.replace(/[()+]/g, "\\$&"))
  .join("|")})`;

const SYMBOL_RELATION = new RegExp(
  String.raw`^${ENTITY}${ALIAS}\s*(\|\||\|o|\}\||\}o)(?:--|\.\.)(\|\||o\||\|\{|o\{)\s*${ENTITY}${ALIAS}\s*(?::\s*(.*))?$`,
  "u",
);
const WORD_RELATION = new RegExp(String.raw`^${ENTITY}${ALIAS}\s+${WORD}\s+(?:optionally\s+)?to\s+${WORD}\s+${ENTITY}${ALIAS}\s*(?::\s*(.*))?$`, "iu");
const ENTITY_LINE = new RegExp(String.raw`^${ENTITY}${ALIAS}\s*(?:\{(.*))?$`, "u");
// Each key needs a space or a comma before it, so the pattern cannot match one text in many ways
const ATTRIBUTE = /^(\S+)\s+(\S+)((?:[\s,]+(?:PK|FK|UK)\b)*)\s*(?:"([^"]*)")?$/;
const IGNORED = /^(direction|title|accTitle|accDescr|style|classDef|class|linkStyle)\b/;

const unquote = (name: string) => (name.startsWith('"') ? name.slice(1, -1) : name);
const fold = (name: string) => name.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
const snake = (name: string) =>
  name
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[^\p{L}\p{N}]+/gu, "_")
    .toLowerCase();

/** Writes a type for DBML, with double quotes when DBML would not read it. */
const quoteType = (type: string) => (/^[A-Za-z_]\w*(\(\d+(,\d+)?\))?(\[\])?$/.test(type) ? type : `"${type.replace(/"/g, '\\"')}"`);
const quoteString = (text: string) => `'${text.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;

/** Converts a Mermaid erDiagram to DBML. */
export function importMermaid(source: string): SqlResult {
  const entities = new Map<string, Entity>();
  const relationships: Relationship[] = [];
  const errors: DbError[] = [];
  const entity = (name: string) => {
    const key = unquote(name);
    if (!entities.has(key)) entities.set(key, { name: key, attributes: [] });
    return entities.get(key)!;
  };

  const lines = source.split(/\r?\n/);
  let index = 0;
  // Front matter
  if (lines[0]?.trim() === "---") {
    index = lines.findIndex((line, at) => at > 0 && line.trim() === "---") + 1;
    if (index === 0) return failure("Close the front matter with ---.", 1);
  }
  let started = false;
  let open: Entity | null = null;
  let skipBlock = false;
  /** Reads one line inside an entity block. The line can end the block. */
  const readAttribute = (line: string, lineNumber: number) => {
    const target = open!;
    const body = line.replace(/\s*\}$/, "");
    if (line.endsWith("}")) open = null;
    if (!body) return;
    const match = ATTRIBUTE.exec(body);
    if (!match) {
      errors.push({ message: 'Write each attribute as: type name, then PK, FK, UK, and a "comment" if you need them.', line: lineNumber, column: 1 });
      return;
    }
    const keys = match[3] ?? "";
    target.attributes.push({
      type: match[1],
      name: match[2].replace(/^\*/, ""),
      pk: /PK/.test(keys) || match[2].startsWith("*"),
      fk: /FK/.test(keys),
      unique: /UK/.test(keys),
      note: match[4] ?? null,
      added: false,
    });
  };
  for (; index < lines.length; index++) {
    const line = lines[index].replace(/%%.*$/, "").trim();
    const lineNumber = index + 1;
    if (!line) continue;
    if (!started) {
      if (!/^erDiagram\b/.test(line)) return failure("Start the text with erDiagram.", lineNumber);
      started = true;
      if (line === "erDiagram") continue;
      lines[index] = line.slice("erDiagram".length);
      index--;
      continue;
    }
    if (skipBlock) {
      if (line.includes("}")) skipBlock = false;
      continue;
    }
    if (open) {
      readAttribute(line, lineNumber);
      continue;
    }
    if (IGNORED.test(line)) {
      if (/^accDescr\s*\{/.test(line) && !line.includes("}")) skipBlock = true;
      continue;
    }
    const symbols = SYMBOL_RELATION.exec(line);
    const words = symbols ? null : WORD_RELATION.exec(line);
    if (symbols || words) {
      const [, left, leftMark, rightMark, right, label] = (symbols ?? words)!;
      relationships.push({
        left: entity(left).name,
        right: entity(right).name,
        leftCardinality: symbols ? LEFT_SYMBOLS[leftMark] : WORDS[leftMark.toLowerCase()],
        rightCardinality: symbols ? RIGHT_SYMBOLS[rightMark] : WORDS[rightMark.toLowerCase()],
        label: unquote((label ?? "").trim()),
      });
      continue;
    }
    const declared = ENTITY_LINE.exec(line);
    if (declared) {
      const found = entity(declared[1]);
      if (declared[2] !== undefined) {
        open = found;
        // Attributes and the closing brace can follow the opening brace on the same line
        readAttribute(declared[2].trim(), lineNumber);
      }
      continue;
    }
    errors.push({ message: "This line is not an erDiagram statement.", line: lineNumber, column: 1 });
  }
  if (!started) return failure("Paste a Mermaid erDiagram to import.", 0);
  if (open) errors.push({ message: `Close the ${open.name} block with }.`, line: lines.length, column: 1 });
  if (errors.length > 0) return { ok: false, errors };
  if (entities.size === 0) return failure("The erDiagram has no entities.", 0);

  const links = relationships.map((relationship) => linkOf(relationship, entities));
  assignForeignKeys(links);
  const refs = links.map(refLine);
  const tables = [...entities.values()].map((item) => {
    // DBML needs at least one column in a table
    if (item.attributes.length === 0) keyOf(item);
    return tableBlock(item);
  });
  const text = `${[...tables, ...(refs.length ? [refs.join("\n")] : [])].join("\n\n")}\n`;
  const parsed = parseDbml(text);
  if ("errors" in parsed) return { ok: false, errors: parsed.errors.map((error) => ({ ...error, message: `The DBML from the import is not valid: ${error.message}` })) };
  return { ok: true, text };
}

const failure = (message: string, line: number): SqlResult => ({ ok: false, errors: [{ message, line, column: line ? 1 : 0 }] });

/** Gives the primary key of the entity, and adds an id column when it has none. */
function keyOf(item: Entity): Attribute {
  const key = item.attributes.find((attribute) => attribute.pk) ?? item.attributes.find((attribute) => attribute.name.toLowerCase() === "id");
  if (key) return key;
  const id: Attribute = { type: "integer", name: "id", pk: true, fk: false, unique: false, note: null, added: true };
  item.attributes.unshift(id);
  return id;
}

/** A relationship with its parent key and, when one side holds a foreign key, the child. */
interface Link {
  relationship: Relationship;
  left: Entity;
  right: Entity;
  /** The side that holds the foreign key, or null for many-to-many. */
  child: Entity | null;
  /** The child is the left entity. The two can be the same entity. */
  childIsLeft: boolean;
  parent: Entity;
  key: Attribute;
  column: Attribute | null;
}

function linkOf(relationship: Relationship, entities: Map<string, Entity>): Link {
  const { leftCardinality, rightCardinality } = relationship;
  const left = entities.get(relationship.left)!;
  const right = entities.get(relationship.right)!;
  if (isMany(leftCardinality) && isMany(rightCardinality)) {
    keyOf(right);
    return { relationship, left, right, child: null, childIsLeft: false, parent: left, key: keyOf(left), column: null };
  }
  // The child holds the foreign key: the "many" side, else the optional side, else the right side
  const childIsLeft = isMany(leftCardinality) || (!isMany(rightCardinality) && isOptional(leftCardinality) && !isOptional(rightCardinality));
  const [child, parent] = childIsLeft ? [left, right] : [right, left];
  return { relationship, left, right, child, childIsLeft, parent, key: keyOf(parent), column: null };
}

const isOptional = (cardinality: Cardinality) => cardinality.startsWith("zero");

/** The folded names of the parent that a foreign key name can hold, such as "customer" for CUSTOMERS. */
const parentNames = (parent: Entity) => [...new Set([fold(parent.name), fold(parent.name).replace(/e?s$/, "")])].filter(Boolean);

/** The columns of the child that no other relationship took. */
const freeColumns = (link: Link, used: Set<Attribute>) => link.child!.attributes.filter((attribute) => !used.has(attribute) && attribute !== link.key);

/** Finds a column that the label names, or a column named after the parent key, such as customer_id. */
function exactForeignKey(link: Link, used: Set<Attribute>): Attribute | null {
  const free = freeColumns(link, used);
  const label = link.relationship.label;
  const byLabel = label ? free.find((attribute) => fold(attribute.name) === fold(label)) : undefined;
  if (byLabel) return byLabel;
  const names = new Set(parentNames(link.parent).flatMap((name) => [name + fold(link.key.name), `${name}id`]));
  return free.find((attribute) => names.has(fold(attribute.name))) ?? null;
}

/** Finds an FK column that holds the parent name, else the only free FK column, else adds a column. */
function looseForeignKey(link: Link, used: Set<Attribute>): Attribute {
  const child = link.child!;
  const foreignKeys = freeColumns(link, used).filter((attribute) => attribute.fk);
  const byMark =
    foreignKeys.find((attribute) => parentNames(link.parent).some((name) => fold(attribute.name).includes(name))) ?? (foreignKeys.length === 1 ? foreignKeys[0] : null);
  if (byMark) return byMark;
  const column: Attribute = { type: link.key.type, name: `${snake(link.parent.name)}_${snake(link.key.name)}`, pk: false, fk: true, unique: false, note: null, added: true };
  child.attributes.push(column);
  return column;
}

/**
 * Gives each relationship its foreign key column. Exact matches go first, so that a loose match cannot
 * take a column that another relationship names. Loose matches go from the longest parent name, so
 * that USER_PROFILE takes user_profile_id before USER can.
 */
function assignForeignKeys(links: Link[]): void {
  const used = new Set<Attribute>();
  const take = (link: Link, column: Attribute) => {
    link.column = column;
    column.fk = true;
    used.add(column);
  };
  for (const link of links) {
    const column = link.child && exactForeignKey(link, used);
    if (column) take(link, column);
  }
  const longest = (link: Link) => Math.max(0, ...parentNames(link.parent).map((name) => name.length));
  for (const link of [...links].sort((a, b) => longest(b) - longest(a))) {
    if (link.child && !link.column) take(link, looseForeignKey(link, used));
  }
}

function refLine(link: Link): string {
  const { leftCardinality, rightCardinality, label } = link.relationship;
  const optional = (cardinality: Cardinality) => (isOptional(cardinality) ? "?" : "");
  const end = (item: Entity, attribute: Attribute) => `${quoteName(item.name)}.${quoteName(attribute.name)}`;
  const comment = label ? ` // ${label.replace(/\s+/g, " ")}` : "";
  if (!link.child) {
    return `Ref: ${end(link.left, keyOf(link.left))} ${optional(leftCardinality)}<>${optional(rightCardinality)} ${end(link.right, keyOf(link.right))}${comment}`;
  }
  const [childCardinality, parentCardinality] = link.childIsLeft ? [leftCardinality, rightCardinality] : [rightCardinality, leftCardinality];
  const operator = isMany(childCardinality) ? ">" : "-";
  return `Ref: ${end(link.child, link.column!)} ${optional(childCardinality)}${operator}${optional(parentCardinality)} ${end(link.parent, link.key)}${comment}`;
}

function tableBlock(item: Entity): string {
  const width = Math.max(...item.attributes.map((attribute) => quoteName(attribute.name).length));
  const rows = item.attributes.map((attribute) => {
    const settings = [attribute.pk && "pk", attribute.unique && !attribute.pk && "unique", attribute.note && `note: ${quoteString(attribute.note)}`].filter(Boolean);
    const row = `  ${quoteName(attribute.name).padEnd(width)} ${quoteType(attribute.type)}${settings.length ? ` [${settings.join(", ")}]` : ""}`;
    return attribute.added ? `${row} // Added by the import` : row;
  });
  return `Table ${quoteName(item.name)} {\n${rows.join("\n")}\n}`;
}
